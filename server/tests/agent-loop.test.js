import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { Workspace } from "../src/agent/workspace.js";
import { runCodingTask, createNonInteractiveApprover, exitCodeForStatus } from "../src/agent/agent-loop.js";
import { BUGGY_PROJECT, PLAN, ScriptedModel, call, createRepo, fileExists, git, read, scriptedApprover } from "./helpers.js";

const USER_DIRTY = { "notes.txt": "original notes\nmy unsaved thought\n" };

async function run({ script, approver = scriptedApprover(), limits = {}, validationCommands = ["node check.js"], dirty = USER_DIRTY, ...rest }) {
  const dir = await createRepo(BUGGY_PROJECT, { dirty });
  const workspace = await Workspace.open(dir);
  const model = new ScriptedModel(script);
  const events = [];
  const report = await runCodingTask({
    task: "Fix add() so check.js passes",
    workspace,
    model,
    approver,
    limits,
    validationCommands,
    emit: (e) => events.push(e),
    ...rest,
  });
  return { dir, report, model, events, approver };
}

const FIX = call("edit_file", { path: "math.js", oldText: "return a - b;", newText: "return a + b;" });
const WRONG_FIX = call("edit_file", { path: "math.js", oldText: "return a - b;", newText: "return a * b;" });

test("success path: inspect, plan, edit, validate, report", async () => {
  const { dir, report, model } = await run({
    script: [
      { toolCalls: [call("list_files"), call("read_file", { path: "math.js" })] },
      { toolCalls: [call("submit_plan", PLAN)] },
      { toolCalls: [FIX] },
      { toolCalls: [call("run_command", { command: "node check.js" })] },
      { toolCalls: [call("finish", { summary: "Changed - to +." })] },
    ],
  });

  assert.equal(report.status, "passed");
  assert.equal(exitCodeForStatus(report.status), 0);
  assert.deepEqual(report.filesChanged, [
    { path: "math.js", action: "modified", added: 1, removed: 1, hadUserChanges: false },
  ]);
  assert.equal(report.verification.length, 1);
  assert.equal(report.verification[0].exitCode, 0);
  assert.match(report.verification[0].output, /all checks passed/);
  assert.deepEqual(report.otherChanges, []);
  assert.equal(report.steps.used, 5);
  assert.equal(report.agentSummary, "Changed - to +.");

  // The tool result the model saw for read_file contained the real file.
  const toolMsg = model.calls[1].find((m) => m.role === "tool");
  assert.match(toolMsg.results[1].output.content, /return a - b/);

  // Changes are left uncommitted and inspectable; the user's edit is untouched.
  assert.equal(await read(dir, "math.js"), "export function add(a, b) {\n  return a + b;\n}\n");
  assert.equal(await read(dir, "notes.txt"), USER_DIRTY["notes.txt"]);
  assert.deepEqual(git(dir, "diff", "--name-only").trim().split("\n").sort(), ["math.js", "notes.txt"]);
  assert.equal(git(dir, "rev-list", "--count", "HEAD").trim(), "1");
});

test("a failed verification is fed back and repaired", async () => {
  const { report, model } = await run({
    script: [
      { toolCalls: [call("submit_plan", PLAN)] },
      { toolCalls: [WRONG_FIX] },
      { toolCalls: [call("finish", { summary: "done" })] },
      { toolCalls: [call("edit_file", { path: "math.js", oldText: "a * b", newText: "a + b" })] },
      { toolCalls: [call("finish", { summary: "fixed for real" })] },
    ],
  });

  assert.equal(report.status, "passed");
  assert.equal(report.repairs.used, 1);
  const repairPrompt = model.calls[3].at(-1);
  assert.equal(repairPrompt.role, "user");
  assert.match(repairPrompt.content, /FAILED/);
  assert.match(repairPrompt.content, /expected add\(2, 3\) to be 5, got 6/);
  assert.equal(report.commands.filter((c) => c.source === "harness").length, 2);
});

test("repairs are bounded and failures are reported as failures", async () => {
  const { report } = await run({
    limits: { maxRepairs: 1 },
    script: [
      { toolCalls: [call("submit_plan", PLAN)] },
      { toolCalls: [WRONG_FIX] },
      { toolCalls: [call("finish", { summary: "All tests pass!" })] },
      { toolCalls: [call("finish", { summary: "All tests pass, really." })] },
    ],
  });

  assert.equal(report.status, "validation_failed");
  assert.equal(exitCodeForStatus(report.status), 1);
  assert.equal(report.repairs.used, 1);
  assert.equal(report.verification[0].exitCode, 1);
  assert.match(report.verification[0].output, /got 6/);
});

test("destructive commands are blocked and never run", async () => {
  const { dir, report, model } = await run({
    script: [
      { toolCalls: [call("submit_plan", PLAN)] },
      { toolCalls: [call("run_command", { command: "git checkout -- notes.txt" }), call("run_command", { command: "rm -rf ." })] },
      { toolCalls: [FIX] },
      { toolCalls: [call("finish", { summary: "done" })] },
    ],
  });

  const results = model.calls[2].at(-1).results;
  assert.ok(results.every((r) => r.output.ok === false && /blocked/.test(r.output.error)));
  assert.deepEqual(
    report.commands.filter((c) => c.status === "blocked").map((c) => c.command),
    ["git checkout -- notes.txt", "rm -rf ."]
  );
  assert.equal(await read(dir, "notes.txt"), USER_DIRTY["notes.txt"]);
  assert.ok(await fileExists(path.join(dir, "check.js")));
  assert.equal(report.status, "passed");
});

test("unapproved commands are denied when running non-interactively", async () => {
  const { report } = await run({
    approver: createNonInteractiveApprover({ approvePlans: true }),
    validationCommands: [],
    script: [
      { toolCalls: [call("submit_plan", PLAN)] },
      { toolCalls: [FIX, call("run_command", { command: "node check.js" })] },
      { toolCalls: [call("finish", { summary: "done" })] },
    ],
  });

  // `npm test` (detected) and `node check.js` both need approval, which nobody can give.
  assert.equal(report.status, "unverified");
  assert.equal(exitCodeForStatus(report.status), 2);
  assert.ok(report.commands.every((c) => c.status === "denied"));
  assert.deepEqual(report.verification.map((v) => [v.command, v.status]), [["npm test", "denied"]]);
});

test("--yes pre-approves detected validation commands (npm test)", async () => {
  const { report } = await run({
    approver: createNonInteractiveApprover({ approvePlans: true }),
    validationCommands: [],
    autoApproveDetected: true,
    script: [
      { toolCalls: [call("submit_plan", PLAN)] },
      { toolCalls: [FIX] },
      { toolCalls: [call("finish", { summary: "done" })] },
    ],
  });
  assert.equal(report.status, "passed");
  assert.deepEqual(report.verification.map((v) => [v.command, v.exitCode]), [["npm test", 0]]);
});

test("writes before plan approval and outside the workspace are rejected", async () => {
  const { dir, report, model } = await run({
    script: [
      { toolCalls: [FIX] },
      { toolCalls: [call("submit_plan", PLAN)] },
      { toolCalls: [call("write_file", { path: "../escaped.txt", content: "x" }), call("write_file", { path: ".git/hooks/pre-commit", content: "x" })] },
      { toolCalls: [FIX] },
      { toolCalls: [call("finish", { summary: "done" })] },
    ],
  });

  assert.match(model.calls[1].at(-1).results[0].output.error, /No approved plan/);
  const [escape, gitWrite] = model.calls[3].at(-1).results;
  assert.match(escape.output.error, /outside the workspace/);
  assert.match(gitWrite.output.error, /\.git/);
  assert.equal(await fileExists(path.join(path.dirname(dir), "escaped.txt")), false);
  assert.equal(report.status, "passed");
});

test("a rejected plan aborts without touching files", async () => {
  const { dir, report } = await run({
    approver: scriptedApprover({ plan: "deny" }),
    script: [{ toolCalls: [call("submit_plan", PLAN), FIX] }],
  });
  assert.equal(report.status, "aborted");
  assert.deepEqual(report.filesChanged, []);
  assert.equal(await read(dir, "math.js"), BUGGY_PROJECT["math.js"]);
});

test("plan revisions are passed back to the model", async () => {
  let asked = 0;
  const approver = scriptedApprover({
    plan: () => (asked++ === 0 ? { decision: "revise", feedback: "also add a comment" } : { decision: "approve" }),
  });
  const { report, model } = await run({
    approver,
    limits: { planOnly: true },
    script: [{ toolCalls: [call("submit_plan", PLAN)] }, { toolCalls: [call("submit_plan", { ...PLAN, steps: [...PLAN.steps, "Add a comment"] })] }],
  });
  assert.match(model.calls[1].at(-1).results[0].output.error, /also add a comment/);
  assert.equal(report.status, "planned");
  assert.equal(report.plan.steps.length, 3);
  assert.deepEqual(report.filesChanged, []);
});

test("the step limit stops a model that never finishes", async () => {
  const { report } = await run({
    limits: { maxSteps: 3 },
    script: Array.from({ length: 10 }, () => ({ toolCalls: [call("list_files")] })),
  });
  assert.equal(report.status, "limit_reached");
  assert.equal(report.steps.used, 3);
  assert.match(report.reason, /Step limit/);
});

test("the token budget stops the run", async () => {
  const { report } = await run({
    limits: { maxTokens: 250 }, // ScriptedModel reports 120 tokens per call
    script: Array.from({ length: 10 }, () => ({ toolCalls: [call("list_files")] })),
  });
  assert.equal(report.status, "limit_reached");
  assert.equal(report.steps.used, 3);
  assert.match(report.reason, /Token budget/);
});

test("model errors end the run with an error status", async () => {
  const failing = {
    async generate() {
      const err = new Error("The model provider's rate limit was reached.");
      err.kind = "rate_limit";
      throw err;
    },
  };
  const dir = await createRepo(BUGGY_PROJECT);
  const report = await runCodingTask({
    task: "anything",
    workspace: await Workspace.open(dir),
    model: failing,
    approver: scriptedApprover(),
  });
  assert.equal(report.status, "error");
  assert.match(report.reason, /rate limit/);
});

test("finishing without changes skips validation", async () => {
  const { report } = await run({
    script: [{ toolCalls: [call("read_file", { path: "math.js" })] }, { toolCalls: [call("finish", { summary: "Nothing to do." })] }],
  });
  assert.equal(report.status, "no_changes");
  assert.deepEqual(report.verification, []);
});
