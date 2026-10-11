import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { Workspace, WorkspaceError, isSecretFile, parsePorcelainZ } from "../src/agent/workspace.js";
import { createRepo, makeTempDir } from "./helpers.js";

test("resolve() keeps paths inside the workspace", async () => {
  const dir = await createRepo({ "src/a.js": "x\n" });
  const ws = await Workspace.open(dir);

  assert.deepEqual(await ws.resolve("src/a.js"), { abs: path.join(dir, "src", "a.js"), rel: "src/a.js" });
  assert.equal((await ws.resolve("src/../src/new.js")).rel, "src/new.js");

  for (const bad of ["../outside.txt", "src/../../outside.txt", path.join(path.dirname(dir), "elsewhere.txt")]) {
    await assert.rejects(ws.resolve(bad), WorkspaceError, `expected ${bad} to be rejected`);
  }
});

test("resolve() rejects .git, secrets and node_modules writes", async () => {
  const dir = await createRepo({ "a.js": "x\n" });
  const ws = await Workspace.open(dir);

  await assert.rejects(ws.resolve(".git/config"), /\.git/);
  await assert.rejects(ws.resolve(".env"), /secret/);
  await assert.rejects(ws.resolve("config/.env.production"), /secret/);
  await assert.rejects(ws.resolve("node_modules/x/index.js", { forWrite: true }), /node_modules/);
  assert.equal((await ws.resolve("node_modules/x/index.js")).rel, "node_modules/x/index.js");
  assert.equal((await ws.resolve(".env.example")).rel, ".env.example");
});

test("resolve() rejects symlinks that point outside the workspace", async (t) => {
  const dir = await createRepo({ "a.js": "x\n" });
  const outside = await makeTempDir("lumina-outside-");
  try {
    await fs.symlink(outside, path.join(dir, "link"), "junction");
  } catch {
    t.skip("symlinks not permitted on this system");
    return;
  }
  const ws = await Workspace.open(dir);
  await assert.rejects(ws.resolve("link/secret.txt"), /symlink/);
});

test("isSecretFile() distinguishes secrets from templates", () => {
  for (const f of [".env", ".env.local", "deploy/key.pem", "id_rsa", ".npmrc"]) assert.ok(isSecretFile(f), f);
  for (const f of [".env.example", ".env.sample", "env.js", "keys.js", "README.md"]) assert.ok(!isSecretFile(f), f);
});

test("parsePorcelainZ() handles renames and untracked files", () => {
  const parsed = parsePorcelainZ(" M a.js\0R  new.js\0old.js\0?? dir/b.js\0");
  assert.deepEqual([...parsed], [["a.js", " M"], ["new.js", "R "], ["dir/b.js", "??"]]);
});

test("gitStatus() and diffNumstat() are relative to a workspace inside a repo", async () => {
  const dir = await createRepo({ "pkg/a.js": "one\n", "other.js": "x\n" });
  await fs.writeFile(path.join(dir, "pkg/a.js"), "one\ntwo\n");
  await fs.writeFile(path.join(dir, "other.js"), "changed\n");
  await fs.writeFile(path.join(dir, "pkg/new.js"), "n\n");

  const ws = await Workspace.open(path.join(dir, "pkg"));
  const status = await ws.gitStatus();
  assert.deepEqual([...status.keys()].sort(), ["a.js", "new.js"]);
  assert.deepEqual((await ws.diffNumstat(["a.js"])).get("a.js"), { added: 1, removed: 0 });
});

test("detectValidationCommands() reads package scripts and skips the npm placeholder", async () => {
  const dir = await makeTempDir();
  await fs.writeFile(
    path.join(dir, "package.json"),
    JSON.stringify({ scripts: { test: "vitest run", lint: "eslint .", typecheck: "tsc --noEmit", dev: "vite" } })
  );
  let ws = await Workspace.open(dir);
  assert.deepEqual(
    (await ws.detectValidationCommands()).map((c) => c.command),
    ["npm test", "npm run typecheck", "npm run lint"]
  );

  await fs.writeFile(path.join(dir, "pnpm-lock.yaml"), "");
  await fs.writeFile(
    path.join(dir, "package.json"),
    JSON.stringify({ scripts: { test: 'echo "Error: no test specified" && exit 1', lint: "eslint ." } })
  );
  ws = await Workspace.open(dir);
  assert.deepEqual((await ws.detectValidationCommands()).map((c) => c.command), ["pnpm run lint"]);
});

test("search() and listFiles() work with and without git", async () => {
  const repo = await createRepo({ "src/a.js": "const needle = 1;\n", "b.txt": "nothing\n" });
  const plain = await makeTempDir();
  await fs.mkdir(path.join(plain, "src"));
  await fs.writeFile(path.join(plain, "src/a.js"), "const needle = 1;\n");
  await fs.mkdir(path.join(plain, "node_modules"));
  await fs.writeFile(path.join(plain, "node_modules/dep.js"), "needle\n");

  // Stop git discovery at the temp dir, in case it sits inside another repository.
  const ceiling = process.env.GIT_CEILING_DIRECTORIES;
  process.env.GIT_CEILING_DIRECTORIES = path.dirname(plain);
  const plainWs = await Workspace.open(plain);
  if (ceiling === undefined) delete process.env.GIT_CEILING_DIRECTORIES;
  else process.env.GIT_CEILING_DIRECTORIES = ceiling;
  assert.equal(plainWs.isGitRepo, false);

  for (const ws of [await Workspace.open(repo), plainWs]) {
    assert.deepEqual(await ws.search("NEEDLE"), [{ path: "src/a.js", line: 1, text: "const needle = 1;" }]);
    const { files } = await ws.listFiles();
    assert.ok(files.includes("src/a.js"));
    assert.ok(!files.some((f) => f.startsWith("node_modules")));
  }
});
