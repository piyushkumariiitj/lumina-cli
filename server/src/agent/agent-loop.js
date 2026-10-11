import { TOOL_DEFINITIONS, ToolExecutor, executeCommand } from "./tools.js";
import { normalizeCommand } from "./command-policy.js";
import {
  SYSTEM_PROMPT,
  buildTaskMessage,
  buildRepairMessage,
  NUDGE_PLAN,
  NUDGE_MALFORMED_TOOL_CALL,
} from "./prompts.js";
import { buildReport } from "./report.js";

export const DEFAULT_LIMITS = {
  maxSteps: 30, // model calls
  maxRepairs: 2, // verification failures fed back to the model
  maxTokens: 300_000, // input + output tokens across all model calls
  commandTimeoutMs: 180_000,
  timeLimitMs: 20 * 60_000,
  maxFilesChanged: 20,
  maxWriteBytes: 256 * 1024,
  maxPlanRevisions: 2,
  maxNudges: 3,
  maxContextChars: 120_000,
  planOnly: false,
  allowDirty: false,
};

/** Approver that never prompts: used when stdin is not a TTY. */
export function createNonInteractiveApprover({ approvePlans = false } = {}) {
  return {
    async approvePlan() {
      return { decision: approvePlans ? "approve" : "deny" };
    },
    async approveCommand() {
      return "deny";
    },
    async approveDirtyFileEdit() {
      return false;
    },
  };
}

/**
 * Drops bulky tool outputs (and large write_file payloads) from older messages
 * once the history exceeds maxChars, keeping the most recent messages intact.
 */
export function compactHistory(messages, maxChars, keepRecent = 6) {
  let size = JSON.stringify(messages).length;
  for (let i = 0; i < messages.length - keepRecent && size > maxChars; i++) {
    const m = messages[i];
    const parts =
      m.role === "tool"
        ? m.results.map((r) => [r, "output"])
        : m.role === "assistant"
          ? (m.toolCalls ?? []).filter((c) => c.name === "write_file").map((c) => [c, "input"])
          : [];
    for (const [holder, key] of parts) {
      if (holder.compacted) continue;
      const before = JSON.stringify(holder[key] ?? null).length;
      if (before < 500) continue;
      holder[key] =
        key === "output"
          ? { ok: holder[key]?.ok, note: "Output removed to save context. Call the tool again if you still need it." }
          : { ...holder[key], content: "[omitted to save context]" };
      holder.compacted = true;
      size -= before - JSON.stringify(holder[key]).length;
    }
  }
}

function resolveValidationCommands(userValidation, detected, plan) {
  let list = userValidation;
  if (list.length === 0) list = detected.map((d) => d.command);
  if (list.length === 0) list = plan?.validationCommands ?? [];
  return [...new Set(list.map(normalizeCommand).filter(Boolean))];
}

/**
 * Runs one coding task to completion (or until a limit is hit) and returns a report
 * whose validation results come only from commands the harness actually executed.
 */
export async function runCodingTask({
  task,
  workspace,
  model,
  approver,
  limits: limitOverrides = {},
  validationCommands = [],
  autoApproveDetected = false,
  emit = () => {},
  now = Date.now,
}) {
  const limits = { ...DEFAULT_LIMITS, ...limitOverrides };
  const startedAt = now();
  const userValidation = validationCommands.map(normalizeCommand).filter(Boolean);

  const baselineDirty = await workspace.gitStatus();
  const detected = await workspace.detectValidationCommands();
  const preApproved = new Set(userValidation);
  if (autoApproveDetected) for (const d of detected) preApproved.add(normalizeCommand(d.command));

  const state = {
    plan: null,
    planApproved: false,
    planRevisions: 0,
    changedFiles: new Map(),
    approvedDirtyFiles: new Set(),
    baselineDirty,
    commands: [],
    approvedCommands: new Set(),
    finishRequested: null,
    stopRequested: null,
    agentSummary: null,
    verification: null,
    repairs: 0,
    steps: 0,
    usage: { inputTokens: 0, outputTokens: 0 },
  };
  const ctx = { workspace, state, limits, approver, emit, preApproved };
  const executor = new ToolExecutor(ctx);

  const description = await workspace.describe({ dirty: baselineDirty, validation: detected });
  const messages = [{ role: "user", content: buildTaskMessage(task, description, userValidation) }];
  emit({ type: "start", workspace: workspace.root, detected, limits });

  let nudges = 0;
  let outcome = null;

  while (!outcome) {
    const tokens = state.usage.inputTokens + state.usage.outputTokens;
    if (state.steps >= limits.maxSteps) {
      outcome = { status: "limit_reached", reason: `Step limit reached (${limits.maxSteps} model calls).` };
      break;
    }
    if (tokens >= limits.maxTokens) {
      outcome = { status: "limit_reached", reason: `Token budget exhausted (${tokens} of ${limits.maxTokens}).` };
      break;
    }
    if (now() - startedAt >= limits.timeLimitMs) {
      outcome = { status: "limit_reached", reason: `Time limit reached (${Math.round(limits.timeLimitMs / 60000)} min).` };
      break;
    }

    compactHistory(messages, limits.maxContextChars);
    emit({ type: "model-start", step: state.steps + 1, maxSteps: limits.maxSteps });

    let response;
    try {
      response = await model.generate({ system: SYSTEM_PROMPT, messages, tools: TOOL_DEFINITIONS });
    } catch (err) {
      state.steps++;
      emit({ type: "model-error", kind: err.kind, message: err.message });
      if (err.kind === "tool_use_failed" && nudges < limits.maxNudges) {
        nudges++;
        messages.push({ role: "user", content: NUDGE_MALFORMED_TOOL_CALL });
        continue;
      }
      outcome = { status: "error", reason: `Model call failed: ${err.message}` };
      break;
    }

    state.steps++;
    state.usage.inputTokens += response.usage.inputTokens;
    state.usage.outputTokens += response.usage.outputTokens;
    messages.push({ role: "assistant", text: response.text, toolCalls: response.toolCalls });
    if (response.text.trim()) emit({ type: "assistant-text", text: response.text });

    if (response.toolCalls.length === 0) {
      if (!state.planApproved) {
        if (++nudges > limits.maxNudges) {
          outcome = { status: "aborted", reason: "The model did not produce a plan." };
          break;
        }
        messages.push({ role: "user", content: NUDGE_PLAN });
        continue;
      }
      // Plain text after planning is treated as the final answer.
      state.finishRequested = { summary: response.text.trim() || "(no summary provided)" };
    } else {
      const results = [];
      for (const call of response.toolCalls) {
        let output;
        if (state.stopRequested || state.finishRequested) {
          output = { ok: false, error: "Skipped: the run is stopping." };
        } else if (call.invalid) {
          output = { ok: false, error: `Invalid arguments for ${call.name}: ${call.error}` };
        } else {
          emit({ type: "tool-call", name: call.name, input: call.input });
          output = await executor.execute(call.name, call.input);
          emit({ type: "tool-result", name: call.name, input: call.input, output });
        }
        results.push({ id: call.id, name: call.name, output });
      }
      messages.push({ role: "tool", results });
    }

    if (state.stopRequested) {
      outcome = state.stopRequested;
      break;
    }

    if (state.finishRequested) {
      state.agentSummary = state.finishRequested.summary;
      state.finishRequested = null;

      if (state.changedFiles.size === 0) {
        outcome = { status: "no_changes", reason: "The agent finished without modifying any files." };
        break;
      }

      const commands = resolveValidationCommands(userValidation, detected, state.plan);
      if (commands.length === 0) {
        state.verification = [];
        outcome = { status: "unverified", reason: "No validation commands were found or provided (use --validate)." };
        break;
      }

      emit({ type: "verify-start", commands });
      const runs = [];
      for (const command of commands) {
        const res = await executeCommand(ctx, command, { purpose: "final verification", source: "harness" });
        runs.push({
          command,
          status: res.status,
          exitCode: res.status === "ran" ? res.exitCode : null,
          timedOut: Boolean(res.timedOut),
          durationMs: res.durationMs ?? 0,
          output: res.output ?? "",
          error: res.error,
        });
      }
      state.verification = runs;
      emit({ type: "verify-end", runs });

      const executed = runs.filter((r) => r.status === "ran");
      const failed = executed.filter((r) => r.exitCode !== 0 || r.timedOut);

      if (failed.length > 0) {
        if (state.repairs < limits.maxRepairs) {
          state.repairs++;
          emit({ type: "repair", attempt: state.repairs, max: limits.maxRepairs });
          messages.push({ role: "user", content: buildRepairMessage(failed, state.repairs, limits.maxRepairs) });
          continue;
        }
        outcome = {
          status: "validation_failed",
          reason: `Validation still failing after ${state.repairs} repair attempt(s).`,
        };
      } else if (executed.length === 0) {
        outcome = { status: "unverified", reason: "No validation command was allowed to run." };
      } else if (executed.length < runs.length) {
        outcome = { status: "partially_verified", reason: "Some validation commands were blocked or not approved." };
      } else {
        outcome = { status: "passed", reason: "All validation commands passed." };
      }
    }
  }

  emit({ type: "end", status: outcome.status });
  return buildReport({ task, workspace, state, limits, outcome, durationMs: now() - startedAt });
}

export function exitCodeForStatus(status) {
  if (["passed", "planned", "no_changes"].includes(status)) return 0;
  if (["unverified", "partially_verified"].includes(status)) return 2;
  return 1;
}
