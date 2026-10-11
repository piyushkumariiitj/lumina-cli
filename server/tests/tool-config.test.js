import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  availableTools,
  evaluateMathExpression,
  assertPublicHttpUrl,
  setCodeExecutionApprover,
} from "../src/config/tool.config.js";
import { createApplicationFiles, sanitizeFolderName } from "../src/config/agent.config.js";
import { createRepo, fileExists, makeTempDir } from "./helpers.js";

const runTool = (id, input) => availableTools.find((t) => t.id === id).getTool().execute(input, { toolCallId: "t", messages: [] });

test("calculator evaluates arithmetic and rejects anything else", () => {
  assert.equal(evaluateMathExpression("2 + 3 * 4"), 14);
  assert.equal(evaluateMathExpression("2^10"), 1024);
  assert.equal(evaluateMathExpression("Math.sqrt(256) * 12"), 192);
  assert.equal(evaluateMathExpression("Math.max(1, 5, 3) % 4"), 1);
  for (const bad of ["process.exit(1)", "this", "Math.max.constructor('return 1')()", "(1).constructor", "require('fs')", "a=1"]) {
    assert.throws(() => evaluateMathExpression(bad), undefined, bad);
  }
});

test("workspace_reader is confined to the current project and refuses secrets", async (t) => {
  const dir = await createRepo({ "src/a.js": "hello\n", ".env": "SECRET=1\n" });
  const cwd = process.cwd();
  process.chdir(dir);
  t.after(() => process.chdir(cwd));

  assert.equal((await runTool("workspace_reader", { filePath: "src/a.js" })).content, "hello\n");
  assert.match((await runTool("workspace_reader", { filePath: "../outside.txt" })).error, /outside the workspace/);
  assert.match((await runTool("workspace_reader", { filePath: ".env" })).error, /secret/);
});

test("code execution needs approval and never goes through a shell", async (t) => {
  t.after(() => setCodeExecutionApprover(null));

  setCodeExecutionApprover(async () => false);
  const denied = await runTool("code_execution", { language: "javascript", code: "console.log(1)" });
  assert.equal(denied.success, false);
  assert.match(denied.error, /did not approve/);

  const seen = [];
  setCodeExecutionApprover(async (language, code) => {
    seen.push([language, code]);
    return true;
  });
  // Shell metacharacters stay inside the JavaScript string.
  const code = 'console.log("a & echo injected | b $(whoami) `id`")';
  const ok = await runTool("code_execution", { language: "javascript", code });
  assert.equal(ok.success, true);
  assert.equal(ok.stdout, "a & echo injected | b $(whoami) `id`");
  assert.deepEqual(seen, [["javascript", code]]);
});

test("fetch_url refuses local and private addresses", async () => {
  for (const url of ["http://localhost:3005/api/me", "http://127.0.0.1/", "http://10.0.0.5/", "http://192.168.1.1/", "http://[::1]/", "file:///etc/passwd"]) {
    await assert.rejects(assertPublicHttpUrl(url), undefined, url);
  }
  const res = await runTool("fetch_url", { url: "http://127.0.0.1:9/" });
  assert.equal(res.success, false);
});

test("the app scaffolder keeps generated files inside a new folder", async () => {
  const base = await makeTempDir();
  await fs.mkdir(path.join(base, "my-app"));
  await fs.writeFile(path.join(base, "my-app", "keep.txt"), "existing");

  const result = await createApplicationFiles(base, "../../My App", [
    { path: "index.html", content: "<h1>hi</h1>" },
    { path: "src/app.js", content: "console.log(1)" },
    { path: "../escape.txt", content: "x" },
    { path: "../../../escape2.txt", content: "x" },
    { path: ".env", content: "SECRET=1" },
    { path: ".git/hooks/post-checkout", content: "x" },
  ]);

  assert.equal(sanitizeFolderName("../../My App"), "my-app");
  assert.equal(result.folder, "my-app-2", "an existing non-empty folder is not reused");
  assert.deepEqual(result.written, ["index.html", "src/app.js"]);
  assert.deepEqual(result.skipped.map((s) => s.path), ["../escape.txt", "../../../escape2.txt", ".env", ".git/hooks/post-checkout"]);
  assert.equal(await fileExists(path.join(base, "escape.txt")), false);
  assert.equal(await fileExists(path.join(path.dirname(base), "escape2.txt")), false);
  assert.equal(await fs.readFile(path.join(base, "my-app", "keep.txt"), "utf8"), "existing");
});
