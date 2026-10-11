import { test } from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { createInteractiveApprover } from "../src/cli/commands/ai/task.js";

const KEYS = { enter: "\r", down: "\x1b[B", ctrlC: "\x03" };
const stripAnsi = (s) => s.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "");

/**
 * Drives the real @clack/prompts UI through fake terminal streams: waits until
 * `waitFor` text is rendered, then types the given keys.
 */
function terminal() {
  const input = new PassThrough();
  const output = new PassThrough();
  let screen = "";
  const waiters = [];
  output.on("data", (d) => {
    screen += d.toString();
    for (const w of [...waiters]) {
      if (stripAnsi(screen).includes(w.text)) {
        waiters.splice(waiters.indexOf(w), 1);
        w.resolve();
      }
    }
  });
  const waitFor = (text) =>
    stripAnsi(screen).includes(text) ? Promise.resolve() : new Promise((resolve) => waiters.push({ text, resolve }));

  return {
    io: { input, output },
    screen: () => stripAnsi(screen),
    async type(waitText, ...keys) {
      await waitFor(waitText);
      for (const key of keys) {
        await new Promise((r) => setTimeout(r, 15));
        input.write(key);
      }
    },
  };
}

const PLAN = { summary: "s", steps: ["a"] };

test("plan prompt: Enter approves", async () => {
  const term = terminal();
  const approver = createInteractiveApprover({ ...term.io });
  const answer = approver.approvePlan(PLAN);
  await term.type("Approve this plan?", KEYS.enter);
  assert.deepEqual(await answer, { decision: "approve" });
});

test("plan prompt: request changes collects feedback", async () => {
  const term = terminal();
  const approver = createInteractiveApprover({ ...term.io });
  const answer = approver.approvePlan(PLAN);
  await term.type("Approve this plan?", KEYS.down, KEYS.enter);
  await term.type("What should change", ..."add tests", KEYS.enter);
  assert.deepEqual(await answer, { decision: "revise", feedback: "add tests" });
});

test("plan prompt: Cancel and Ctrl+C both deny", async () => {
  for (const keys of [[KEYS.down, KEYS.down, KEYS.enter], [KEYS.ctrlC]]) {
    const term = terminal();
    const answer = createInteractiveApprover({ ...term.io }).approvePlan(PLAN);
    await term.type("Approve this plan?", ...keys);
    assert.deepEqual(await answer, { decision: "deny" });
  }
});

test("--yes skips the plan prompt entirely", async () => {
  const term = terminal();
  const answer = await createInteractiveApprover({ autoApprovePlan: true, ...term.io }).approvePlan(PLAN);
  assert.deepEqual(answer, { decision: "approve" });
  assert.equal(term.screen(), "");
});

test("command prompt: once / always / deny / Ctrl+C", async () => {
  const cases = [
    [[KEYS.enter], "once"],
    [[KEYS.down, KEYS.enter], "always"],
    [[KEYS.down, KEYS.down, KEYS.enter], "deny"],
    [[KEYS.ctrlC], "deny"],
  ];
  for (const [keys, expected] of cases) {
    const term = terminal();
    let spinnerStopped = false;
    const approver = createInteractiveApprover({ stopSpinner: () => (spinnerStopped = true), ...term.io });
    const answer = approver.approveCommand("npm test", { purpose: "run the suite" });
    await term.type("Allow command", ...keys);
    assert.equal(await answer, expected);
    assert.equal(spinnerStopped, true, "spinner is stopped before prompting");
    assert.match(term.screen(), /npm test/);
  }
});

test("dirty-file prompt defaults to No", async () => {
  const term = terminal();
  const approver = createInteractiveApprover({ ...term.io });
  const no = approver.approveDirtyFileEdit("notes.txt");
  await term.type("notes.txt has uncommitted changes", KEYS.enter);
  assert.equal(await no, false);

  const term2 = terminal();
  const yes = createInteractiveApprover({ ...term2.io }).approveDirtyFileEdit("notes.txt");
  await term2.type("notes.txt has uncommitted changes", "y", KEYS.enter);
  assert.equal(await yes, true);
});
