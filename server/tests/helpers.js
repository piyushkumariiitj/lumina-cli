import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

export async function makeTempDir(prefix = "lumina-test-") {
  return fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), prefix)));
}

export function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", windowsHide: true });
}

/** Creates a git repo with `files` committed, then applies `dirty` as uncommitted edits. */
export async function createRepo(files, { dirty = {} } = {}) {
  // Nest the repo in its own parent so "outside the workspace" checks see a private, empty directory.
  const dir = path.join(await makeTempDir(), "repo");
  await fs.mkdir(dir);
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "test@example.com");
  git(dir, "config", "user.name", "Lumina Test");
  git(dir, "config", "core.autocrlf", "false");
  for (const [rel, content] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
    await fs.writeFile(path.join(dir, rel), content);
  }
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "init");
  for (const [rel, content] of Object.entries(dirty)) {
    await fs.writeFile(path.join(dir, rel), content);
  }
  return dir;
}

export const read = (dir, rel) => fs.readFile(path.join(dir, rel), "utf8");

export const fileExists = (p) =>
  fs.access(p).then(
    () => true,
    () => false
  );

/**
 * A fake model that replays a script. Each entry is either a response object
 * ({ text?, toolCalls? }) or a function (messages) => response.
 */
export class ScriptedModel {
  constructor(script) {
    this.script = script;
    this.calls = [];
    this.nextId = 1;
  }

  async generate({ messages }) {
    this.calls.push(structuredClone(messages));
    const entry = this.script[this.calls.length - 1];
    if (!entry) throw new Error(`ScriptedModel: no response scripted for call ${this.calls.length}`);
    const response = typeof entry === "function" ? entry(messages) : entry;
    return {
      text: response.text ?? "",
      toolCalls: (response.toolCalls ?? []).map((c) => ({ id: `call_${this.nextId++}`, invalid: false, ...c })),
      usage: { inputTokens: 100, outputTokens: 20 },
      finishReason: "tool-calls",
    };
  }
}

export const call = (name, input = {}) => ({ name, input });

export function scriptedApprover({ plan = "approve", command = "deny", dirty = false } = {}) {
  const log = [];
  return {
    log,
    async approvePlan(p) {
      log.push(["plan", p.summary]);
      return typeof plan === "function" ? plan(p) : { decision: plan };
    },
    async approveCommand(cmd) {
      log.push(["command", cmd]);
      return typeof command === "function" ? command(cmd) : command;
    },
    async approveDirtyFileEdit(rel) {
      log.push(["dirty", rel]);
      return dirty;
    },
  };
}

/** A small Node project with a bug: add() subtracts. */
export const BUGGY_PROJECT = {
  "package.json": JSON.stringify({ name: "fixture", type: "module", scripts: { test: "node check.js" } }, null, 2) + "\n",
  "math.js": "export function add(a, b) {\n  return a - b;\n}\n",
  "check.js":
    'import { add } from "./math.js";\n' +
    "const got = add(2, 3);\n" +
    "if (got !== 5) {\n  console.error(`expected add(2, 3) to be 5, got ${got}`);\n  process.exit(1);\n}\n" +
    'console.log("all checks passed");\n',
  "notes.txt": "original notes\n",
};

export const PLAN = {
  summary: "Fix add() to return the sum",
  steps: ["Change the subtraction in math.js to addition", "Run node check.js"],
  filesToChange: ["math.js"],
  validationCommands: ["node check.js"],
};
