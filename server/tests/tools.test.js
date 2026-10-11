import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { Workspace } from "../src/agent/workspace.js";
import { ToolExecutor } from "../src/agent/tools.js";
import { DEFAULT_LIMITS } from "../src/agent/agent-loop.js";
import { createRepo, read, scriptedApprover } from "./helpers.js";

async function setup(files, { dirty = {}, planApproved = true, approver = scriptedApprover(), limits = {} } = {}) {
  const dir = await createRepo(files, { dirty });
  const workspace = await Workspace.open(dir);
  const state = {
    planApproved,
    planRevisions: 0,
    changedFiles: new Map(),
    approvedDirtyFiles: new Set(),
    baselineDirty: await workspace.gitStatus(),
    commands: [],
    approvedCommands: new Set(),
  };
  const events = [];
  const exec = new ToolExecutor({
    workspace,
    state,
    limits: { ...DEFAULT_LIMITS, ...limits },
    approver,
    emit: (e) => events.push(e),
    preApproved: new Set(),
  });
  return { dir, exec, state, events };
}

test("edit_file requires a unique exact match", async () => {
  const { dir, exec } = await setup({ "a.js": "let x = 1;\nlet y = 1;\n" });

  let res = await exec.execute("edit_file", { path: "a.js", oldText: "= 1;", newText: "= 2;" });
  assert.equal(res.ok, false);
  assert.match(res.error, /matches 2 places/);

  res = await exec.execute("edit_file", { path: "a.js", oldText: "let z", newText: "let w" });
  assert.match(res.error, /not found/);

  res = await exec.execute("edit_file", { path: "a.js", oldText: "let y = 1;", newText: "let y = 2;" });
  assert.equal(res.ok, true);
  assert.equal(await read(dir, "a.js"), "let x = 1;\nlet y = 2;\n");

  res = await exec.execute("edit_file", { path: "a.js", oldText: "let", newText: "const", replaceAll: true });
  assert.equal(res.replacements, 2);
  assert.equal(await read(dir, "a.js"), "const x = 1;\nconst y = 2;\n");
});

test("edit_file matches LF snippets against CRLF files and keeps CRLF", async () => {
  const { dir, exec } = await setup({ "win.js": "function f() {\r\n  return 1;\r\n}\r\n" });
  const res = await exec.execute("edit_file", {
    path: "win.js",
    oldText: "function f() {\n  return 1;",
    newText: "function f() {\n  return 2;",
  });
  assert.equal(res.ok, true);
  assert.equal(await read(dir, "win.js"), "function f() {\r\n  return 2;\r\n}\r\n");
});

test("write tools are rejected until a plan is approved", async () => {
  const { dir, exec } = await setup({ "a.js": "x\n" }, { planApproved: false });
  const res = await exec.execute("write_file", { path: "b.js", content: "y\n" });
  assert.equal(res.ok, false);
  assert.match(res.error, /submit_plan/);
  await assert.rejects(fs.access(path.join(dir, "b.js")));
});

test("write_file creates files, enforces limits and stays in the workspace", async () => {
  const { dir, exec, state } = await setup({ "a.js": "x\n" }, { limits: { maxFilesChanged: 1, maxWriteBytes: 50 } });

  let res = await exec.execute("write_file", { path: "lib/new.js", content: "export {};\n" });
  assert.equal(res.ok, true);
  assert.equal(state.changedFiles.get("lib/new.js").action, "created");

  res = await exec.execute("write_file", { path: "other.js", content: "x" });
  assert.match(res.error, /limit reached/);

  res = await exec.execute("write_file", { path: "lib/new.js", content: "x".repeat(51) });
  assert.match(res.error, /limit 50/);

  res = await exec.execute("write_file", { path: "../escape.js", content: "x" });
  assert.match(res.error, /outside the workspace/);
  await assert.rejects(fs.access(path.join(path.dirname(dir), "escape.js")));
});

test("files with pre-existing user changes need approval", async () => {
  const files = { "notes.txt": "a\n" };
  const dirty = { "notes.txt": "a\nuser edit\n" };

  const denied = await setup(files, { dirty, approver: scriptedApprover({ dirty: false }) });
  const res = await denied.exec.execute("write_file", { path: "notes.txt", content: "agent\n" });
  assert.equal(res.ok, false);
  assert.equal(await read(denied.dir, "notes.txt"), "a\nuser edit\n");

  const approver = scriptedApprover({ dirty: true });
  const allowed = await setup(files, { dirty, approver });
  const ok = await allowed.exec.execute("edit_file", { path: "notes.txt", oldText: "a\n", newText: "b\n" });
  assert.equal(ok.ok, true);
  assert.equal(await read(allowed.dir, "notes.txt"), "b\nuser edit\n");
  assert.deepEqual(approver.log, [["dirty", "notes.txt"]]);
});

test("read_file pages large files and refuses secrets", async () => {
  const big = Array.from({ length: 1000 }, (_, i) => `line ${i + 1}`).join("\n");
  const { exec } = await setup({ "big.txt": big, ".env": "GROQ_API_KEY=x\n" });

  let res = await exec.execute("read_file", { path: "big.txt" });
  assert.equal(res.startLine, 1);
  assert.equal(res.endLine, 400);
  assert.equal(res.truncated, true);

  res = await exec.execute("read_file", { path: "big.txt", startLine: 990 });
  assert.equal(res.content.split("\n")[0], "line 990");
  assert.equal(res.endLine, 1000);

  res = await exec.execute("read_file", { path: ".env" });
  assert.equal(res.ok, false);
  assert.match(res.error, /secret/);
});
