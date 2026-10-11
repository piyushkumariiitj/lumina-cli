import { spawn, execFile } from "node:child_process";

// Credentials the Lumina CLI itself may hold; never leak them into the user's commands.
const SCRUBBED_ENV = new Set([
  "GROQ_API_KEY",
  "GROQ_KEY",
  "BETTER_AUTH_SECRET",
  "GITHUB_CLIENT_SECRET",
  "NODE_TEST_CONTEXT",
  "FORCE_COLOR",
]);

export function buildCommandEnv(base = process.env) {
  const env = {};
  for (const [key, value] of Object.entries(base)) {
    const upper = key.toUpperCase();
    if (SCRUBBED_ENV.has(upper) || upper.startsWith("LUMINA_")) continue;
    env[key] = value;
  }
  env.NO_COLOR = "1";
  return env;
}

/**
 * Keeps the first `head` and last `tail` characters of a stream. Test runners
 * usually print the useful summary at the end, and the first error near the top.
 */
export class OutputBuffer {
  constructor(head = 4000, tail = 8000) {
    this.headLimit = head;
    this.tailLimit = tail;
    this.head = "";
    this.tail = "";
    this.total = 0;
  }

  push(chunk) {
    let text = String(chunk);
    this.total += text.length;
    if (this.head.length < this.headLimit) {
      const take = this.headLimit - this.head.length;
      this.head += text.slice(0, take);
      text = text.slice(take);
    }
    if (text) this.tail = (this.tail + text).slice(-this.tailLimit);
  }

  get truncated() {
    return this.total > this.headLimit + this.tailLimit;
  }

  toString() {
    if (!this.truncated) return this.head + this.tail;
    const omitted = this.total - this.headLimit - this.tailLimit;
    return `${this.head}\n… [${omitted} characters omitted] …\n${this.tail}`;
  }
}

const activeChildren = new Set();

/** Kills every command still running (used on Ctrl+C). */
export function killActiveCommands() {
  for (const child of activeChildren) killTree(child);
}

function killTree(child) {
  if (!child.pid) return;
  if (process.platform === "win32") {
    execFile("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true }, () => {});
  } else {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      try {
        child.kill("SIGKILL");
      } catch {
        // already exited
      }
    }
  }
}

/**
 * Runs a shell command in `cwd` with no stdin, a hard timeout (kills the whole
 * process tree), and bounded output. Never throws; failures are in the result.
 */
export function runCommand(command, { cwd, timeoutMs = 180_000, env = buildCommandEnv(), onOutput } = {}) {
  return new Promise((resolve) => {
    const started = Date.now();
    const output = new OutputBuffer();
    let timedOut = false;
    let settled = false;

    const finish = (exitCode, extra = {}) => {
      if (settled) return;
      settled = true;
      activeChildren.delete(child);
      clearTimeout(timer);
      clearTimeout(forceTimer);
      resolve({
        command,
        exitCode,
        timedOut,
        durationMs: Date.now() - started,
        output: output.toString(),
        outputTruncated: output.truncated,
        ...extra,
      });
    };

    let child;
    try {
      child = spawn(command, {
        cwd,
        env,
        shell: true,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        detached: process.platform !== "win32",
      });
    } catch (err) {
      resolve({ command, exitCode: null, timedOut: false, durationMs: 0, output: "", outputTruncated: false, error: err.message });
      return;
    }
    activeChildren.add(child);

    for (const stream of [child.stdout, child.stderr]) {
      stream.setEncoding("utf8");
      stream.on("data", (chunk) => {
        output.push(chunk);
        onOutput?.(chunk);
      });
    }

    let forceTimer;
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
      // If grandchildren keep the pipes open, give up waiting for 'close'.
      forceTimer = setTimeout(() => {
        child.stdout.destroy();
        child.stderr.destroy();
        finish(null);
      }, 5000);
    }, timeoutMs);

    child.on("error", (err) => finish(null, { error: err.message }));
    child.on("close", (code) => finish(timedOut ? null : code));
  });
}
