import { promises as fs } from "node:fs";
import path from "node:path";
import { Command, InvalidArgumentError } from "commander";
import { select, text, confirm, isCancel } from "@clack/prompts";
import yoctoSpinner from "yocto-spinner";
import { AIService } from "../../ai/groq-service.js";
import { Workspace, WorkspaceError } from "../../../agent/workspace.js";
import { AIServiceModelClient } from "../../../agent/model-client.js";
import {
  runCodingTask,
  createNonInteractiveApprover,
  exitCodeForStatus,
  DEFAULT_LIMITS,
} from "../../../agent/agent-loop.js";
import { killActiveCommands } from "../../../agent/command-runner.js";
import { renderBanner, renderError } from "../../ui/components.js";
import { theme } from "../../ui/theme.js";

const STATUS_LABELS = {
  passed: ["✔ PASSED", theme.successBold],
  planned: ["◆ PLANNED", theme.toolBold],
  no_changes: ["○ NO CHANGES", theme.muted],
  partially_verified: ["▲ PARTIALLY VERIFIED", theme.warningBold],
  unverified: ["▲ UNVERIFIED", theme.warningBold],
  validation_failed: ["✖ VALIDATION FAILED", theme.errorBold],
  limit_reached: ["✖ LIMIT REACHED", theme.errorBold],
  aborted: ["✖ ABORTED", theme.errorBold],
  error: ["✖ ERROR", theme.errorBold],
};

const formatDuration = (ms) => {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
};

const lastLines = (text, n) => (text || "").trimEnd().split(/\r?\n/).slice(-n);

function describeToolCall(name, input = {}) {
  switch (name) {
    case "list_files":
      return `list_files ${input.path || "."}`;
    case "read_file": {
      const range = input.startLine || input.endLine ? ` (L${input.startLine ?? 1}-${input.endLine ?? "…"})` : "";
      return `read_file ${input.path}${range}`;
    }
    case "search_code":
      return `search_code "${input.query}"${input.path ? ` in ${input.path}` : ""}`;
    case "edit_file":
    case "write_file":
      return `${name} ${input.path}`;
    default:
      return name;
  }
}

function createRenderer() {
  let spinner = null;
  const stopSpinner = () => {
    if (spinner) {
      spinner.stop();
      spinner = null;
    }
  };

  const onEvent = (event) => {
    if (event.type !== "model-start") stopSpinner();
    switch (event.type) {
      case "start":
        console.log(`  ${theme.muted("Workspace:")} ${theme.white(event.workspace)}`);
        console.log(
          `  ${theme.muted("Validation:")} ${
            event.detected.length ? event.detected.map((d) => d.command).join(", ") : theme.warning("none detected")
          }\n`
        );
        break;
      case "model-start":
        stopSpinner();
        spinner = yoctoSpinner({ text: theme.muted(`Thinking… (step ${event.step}/${event.maxSteps})`) }).start();
        break;
      case "model-error":
        console.log(`  ${theme.warning("▲")} ${theme.warning(event.message)}`);
        break;
      case "assistant-text": {
        const t = event.text.trim();
        console.log(`  ${theme.agent("Lumina:")} ${theme.white(t.length > 600 ? `${t.slice(0, 600)}…` : t)}`);
        break;
      }
      case "tool-call":
        if (!["run_command", "submit_plan", "finish", "edit_file", "write_file"].includes(event.name)) {
          console.log(`  ${theme.tool("⚡")} ${theme.toolDim(describeToolCall(event.name, event.input))}`);
        }
        break;
      case "tool-result":
        if (event.output?.ok === false && event.name !== "run_command" && event.name !== "submit_plan") {
          console.log(`  ${theme.error("✖")} ${theme.muted(`${describeToolCall(event.name, event.input)}: ${event.output.error}`)}`);
        }
        break;
      case "plan": {
        const { plan } = event;
        console.log(`\n  ${theme.accentBold("Plan")}  ${theme.white(plan.summary)}`);
        plan.steps.forEach((step, i) => console.log(`    ${theme.muted(`${i + 1}.`)} ${step}`));
        if (plan.filesToChange?.length) console.log(`    ${theme.muted("Files:")} ${plan.filesToChange.join(", ")}`);
        if (plan.validationCommands?.length) {
          console.log(`    ${theme.muted("Validate:")} ${plan.validationCommands.join(", ")}`);
        }
        console.log("");
        break;
      }
      case "file":
        console.log(`  ${theme.success("✎")} ${theme.white(`${event.action} ${event.path}`)}`);
        break;
      case "command-blocked":
        console.log(`  ${theme.error("⛔ blocked:")} ${event.command} ${theme.muted(`(${event.reason})`)}`);
        break;
      case "command-denied":
        console.log(`  ${theme.warning("✖ not approved:")} ${event.command}`);
        break;
      case "command-start":
        console.log(`  ${theme.tool("$")} ${theme.white(event.command)}${event.source === "harness" ? theme.muted("  (verification)") : ""}`);
        spinner = yoctoSpinner({ text: theme.muted("running…") }).start();
        break;
      case "command-end": {
        const passed = event.exitCode === 0 && !event.timedOut;
        const label = event.timedOut ? "timed out" : `exit ${event.exitCode ?? "?"}`;
        console.log(`    ${passed ? theme.success("✔") : theme.error("✖")} ${theme.muted(`${label} · ${formatDuration(event.durationMs)}`)}`);
        if (!passed) {
          for (const line of lastLines(event.output || event.error, 12)) console.log(`    ${theme.toolDim(line)}`);
        }
        break;
      }
      case "verify-start":
        console.log(`\n  ${theme.accentBold("Verifying")} ${theme.muted(event.commands.join(", "))}`);
        break;
      case "repair":
        console.log(`\n  ${theme.warning(`↻ Verification failed — repair attempt ${event.attempt}/${event.max}`)}\n`);
        break;
      default:
        break;
    }
  };

  return { onEvent, stopSpinner };
}

/**
 * Approver backed by terminal prompts. `input`/`output` default to the process
 * streams and are injectable for tests.
 */
export function createInteractiveApprover({ autoApprovePlan, stopSpinner = () => {}, input, output } = {}) {
  const io = { input, output };
  return {
    async approvePlan() {
      if (autoApprovePlan) return { decision: "approve" };
      stopSpinner();
      const choice = await select({
        ...io,
        message: "Approve this plan?",
        options: [
          { value: "approve", label: "Approve and implement" },
          { value: "revise", label: "Request changes" },
          { value: "deny", label: "Cancel" },
        ],
      });
      if (isCancel(choice) || choice === "deny") return { decision: "deny" };
      if (choice === "revise") {
        const feedback = await text({ ...io, message: "What should change in the plan?" });
        if (isCancel(feedback)) return { decision: "deny" };
        return { decision: "revise", feedback };
      }
      return { decision: "approve" };
    },
    async approveCommand(command, { purpose }) {
      stopSpinner();
      const choice = await select({
        ...io,
        message: `Allow command: ${theme.white(command)}${purpose ? theme.muted(`  — ${purpose}`) : ""}`,
        options: [
          { value: "once", label: "Run once" },
          { value: "always", label: "Run, and allow this exact command for the rest of this task" },
          { value: "deny", label: "Don't run" },
        ],
      });
      return isCancel(choice) ? "deny" : choice;
    },
    async approveDirtyFileEdit(rel) {
      stopSpinner();
      const ok = await confirm({
        ...io,
        message: `${rel} has uncommitted changes you made before this run. Allow Lumina to modify it?`,
        initialValue: false,
      });
      return !isCancel(ok) && ok === true;
    },
  };
}

function renderReport(report) {
  const [label, color] = STATUS_LABELS[report.status] ?? [report.status, theme.white];
  const rule = theme.border("─".repeat(56));
  console.log(`\n${rule}`);
  console.log(`  ${color(label)}  ${theme.muted(report.reason || "")}`);
  console.log(rule);

  if (report.plan) console.log(`  ${theme.muted("Plan:")} ${report.plan.summary}`);

  if (report.filesChanged.length > 0) {
    console.log(`\n  ${theme.whiteBold(`Files changed by Lumina (${report.filesChanged.length})`)}`);
    for (const f of report.filesChanged) {
      const mark = f.action === "created" ? theme.success("A") : theme.warning("M");
      const stats =
        f.added === null ? "" : ` ${theme.success(`+${f.added}`)} ${theme.error(`-${f.removed ?? 0}`)}`;
      const note = f.hadUserChanges ? theme.warning("  (also has your earlier uncommitted changes)") : "";
      console.log(`    ${mark} ${f.path}${stats}${note}`);
    }
  } else {
    console.log(`\n  ${theme.muted("No files were changed by Lumina.")}`);
  }

  if (report.verification.length > 0) {
    console.log(`\n  ${theme.whiteBold("Validation")} ${theme.muted("(run by Lumina after the agent finished)")}`);
    for (const run of report.verification) {
      if (run.status !== "ran") {
        console.log(`    ${theme.warning("–")} ${run.command}  ${theme.muted(`not run (${run.status})`)}`);
        continue;
      }
      const passed = run.exitCode === 0 && !run.timedOut;
      const detail = run.timedOut ? "timed out" : `exit ${run.exitCode}`;
      console.log(
        `    ${passed ? theme.success("✔") : theme.error("✖")} ${run.command}  ${theme.muted(`${detail} · ${formatDuration(run.durationMs)}`)}`
      );
    }
  } else if (report.status !== "planned" && report.status !== "no_changes") {
    console.log(`\n  ${theme.warning("Validation was not run.")}`);
  }

  if (report.otherChanges.length > 0) {
    console.log(`\n  ${theme.warning("Other files changed during the run (e.g. by commands):")} ${report.otherChanges.join(", ")}`);
  }
  if (report.preexistingChanges > 0) {
    console.log(`  ${theme.muted(`Your ${report.preexistingChanges} pre-existing uncommitted change(s) were preserved.`)}`);
  }
  const blocked = report.commands.filter((c) => c.status === "blocked" || c.status === "denied");
  if (blocked.length > 0) {
    console.log(`  ${theme.muted(`Commands blocked or not approved: ${blocked.map((c) => c.command).join(", ")}`)}`);
  }

  if (report.agentSummary) {
    console.log(`\n  ${theme.agent("Agent summary")} ${theme.muted("(written by the model, not verified)")}`);
    for (const line of report.agentSummary.trim().split(/\r?\n/).slice(0, 15)) console.log(`    ${line}`);
  }

  const tokens = report.tokens.input + report.tokens.output;
  console.log(
    `\n  ${theme.muted(
      `${report.steps.used}/${report.steps.max} steps · ${report.repairs.used}/${report.repairs.max} repairs · ` +
        `${tokens.toLocaleString()} tokens · ${formatDuration(report.durationMs)}`
    )}`
  );
  if (report.filesChanged.length > 0) {
    console.log(
      `  ${theme.muted("Nothing was committed. Review with:")} ${theme.tool(report.gitAvailable ? "git diff" : "your diff tool")}\n`
    );
  }
}

const positiveInt = (name) => (value) => {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new InvalidArgumentError(`${name} must be a non-negative integer.`);
  return n;
};

const collect = (value, previous) => [...previous, value];

const DEFAULT_OPTIONS = {
  validate: [],
  maxSteps: DEFAULT_LIMITS.maxSteps,
  maxRepairs: DEFAULT_LIMITS.maxRepairs,
  maxTokens: DEFAULT_LIMITS.maxTokens,
  commandTimeout: DEFAULT_LIMITS.commandTimeoutMs / 1000,
  timeLimit: DEFAULT_LIMITS.timeLimitMs / 60_000,
  banner: true,
};

export async function taskAction(taskWords, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  if (opts.banner) renderBanner();

  let task = (taskWords || []).join(" ").trim();
  if (!task) {
    if (!interactive) {
      renderError("No task given", 'Usage: lumina task "describe the change you want"');
      process.exit(1);
    }
    const answer = await text({
      message: "What should Lumina do in this repository?",
      placeholder: "e.g. Fix the failing date parsing test in utils/",
      validate: (v) => (!v || v.trim().length < 8 ? "Describe the task in a bit more detail" : undefined),
    });
    if (isCancel(answer)) process.exit(0);
    task = answer.trim();
  }

  if (!interactive && !opts.yes) {
    renderError("Non-interactive mode needs --yes", "Without a terminal Lumina cannot ask for plan approval. Re-run with --yes.");
    process.exit(1);
  }

  let workspace;
  try {
    workspace = await Workspace.open(opts.cwd || process.cwd());
  } catch (err) {
    renderError("Invalid workspace", err instanceof WorkspaceError ? err.message : String(err));
    process.exit(1);
  }

  const model = new AIServiceModelClient(new AIService());
  try {
    await model.init();
  } catch (err) {
    renderError("Could not initialize the AI model", err.message);
    process.exit(1);
  }

  const renderer = createRenderer();
  const approver = interactive
    ? createInteractiveApprover({ autoApprovePlan: Boolean(opts.yes), stopSpinner: renderer.stopSpinner })
    : createNonInteractiveApprover({ approvePlans: true });

  process.once("SIGINT", () => {
    renderer.stopSpinner();
    killActiveCommands();
    console.log(theme.warning("\n  Interrupted. Files already modified stay as they are; review with git diff.\n"));
    process.exit(130);
  });

  console.log(`  ${theme.accentBold("Task:")} ${theme.white(task)}`);

  let report;
  try {
    report = await runCodingTask({
      task,
      workspace,
      model,
      approver,
      validationCommands: opts.validate,
      autoApproveDetected: Boolean(opts.yes),
      emit: renderer.onEvent,
      limits: {
        maxSteps: opts.maxSteps,
        maxRepairs: opts.maxRepairs,
        maxTokens: opts.maxTokens,
        commandTimeoutMs: opts.commandTimeout * 1000,
        timeLimitMs: opts.timeLimit * 60_000,
        planOnly: Boolean(opts.planOnly),
        allowDirty: Boolean(opts.allowDirty),
      },
    });
  } catch (err) {
    renderer.stopSpinner();
    renderError("Task failed unexpectedly", err.stack || err.message);
    process.exit(1);
  }

  renderer.stopSpinner();
  renderReport(report);

  if (opts.reportFile) {
    const file = path.resolve(opts.reportFile);
    await fs.writeFile(file, JSON.stringify(report, null, 2), "utf8");
    console.log(`  ${theme.muted(`Report written to ${file}`)}\n`);
  }
  process.exit(exitCodeForStatus(report.status));
}

export const task = new Command("task")
  .description("Plan, implement and validate a coding task in the current repository")
  .argument("[task...]", "What you want changed (prompted for if omitted)")
  .option("-C, --cwd <dir>", "Workspace directory (default: current directory)")
  .option("-y, --yes", "Auto-approve the plan and the project's detected validation commands")
  .option("--validate <command>", "Validation command to run (repeatable; pre-approved)", collect, [])
  .option("--plan-only", "Stop after the plan is produced and approved")
  .option("--allow-dirty", "Allow edits to files that already had uncommitted changes")
  .option("--max-steps <n>", "Maximum model calls", positiveInt("--max-steps"), DEFAULT_LIMITS.maxSteps)
  .option("--max-repairs <n>", "Maximum repair rounds after failed verification", positiveInt("--max-repairs"), DEFAULT_LIMITS.maxRepairs)
  .option("--max-tokens <n>", "Total token budget", positiveInt("--max-tokens"), DEFAULT_LIMITS.maxTokens)
  .option("--command-timeout <seconds>", "Timeout per command", positiveInt("--command-timeout"), DEFAULT_LIMITS.commandTimeoutMs / 1000)
  .option("--time-limit <minutes>", "Wall-clock limit for the whole task", positiveInt("--time-limit"), DEFAULT_LIMITS.timeLimitMs / 60_000)
  .option("--report-file <path>", "Also write the report as JSON")
  .action(taskAction);
