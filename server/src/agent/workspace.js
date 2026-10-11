import { promises as fs } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";

export class WorkspaceError extends Error {
  constructor(message) {
    super(message);
    this.name = "WorkspaceError";
  }
}

// Directories never walked when listing/searching outside of git.
const IGNORED_DIRS = new Set([
  ".git", "node_modules", "dist", "build", "out", ".next", "coverage",
  ".turbo", ".cache", "__pycache__", ".venv", "venv", "target",
]);

const ENV_TEMPLATE = /^\.env\.(example|sample|template|dist)$/i;
const SECRET_FILES = [
  /^\.env(\..+)?$/i,
  /\.(pem|key|p12|pfx)$/i,
  /^id_(rsa|dsa|ecdsa|ed25519)$/i,
  /^\.(npmrc|netrc|pypirc)$/i,
];

export function isSecretFile(filePath) {
  const base = path.basename(filePath);
  if (ENV_TEMPLATE.test(base)) return false;
  return SECRET_FILES.some((re) => re.test(base));
}

const toPosix = (p) => p.split(path.sep).join("/");

// Never surfaced from git listings, even when a project forgot to ignore them.
const inVendorDir = (p) => /(^|\/)(node_modules|\.git)\//.test(p);

function escapesRoot(rel) {
  return rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel);
}

async function exists(p) {
  try {
    await fs.lstat(p);
    return true;
  } catch {
    return false;
  }
}

export function runGit(cwd, args, { timeoutMs = 15000 } = {}) {
  return new Promise((resolve) => {
    execFile(
      "git",
      args,
      { cwd, timeout: timeoutMs, maxBuffer: 20 * 1024 * 1024, windowsHide: true },
      (error, stdout, stderr) => {
        resolve({
          ok: !error,
          code: error ? (typeof error.code === "number" ? error.code : 1) : 0,
          stdout: String(stdout ?? ""),
          stderr: String(stderr ?? ""),
        });
      }
    );
  });
}

/**
 * Parses `git status --porcelain=v1 -z` output into Map<repoRelativePath, XY>.
 */
export function parsePorcelainZ(output) {
  const entries = new Map();
  const tokens = output.split("\0");
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.length < 4) continue;
    const xy = token.slice(0, 2);
    entries.set(token.slice(3), xy);
    // Renames/copies are followed by the original path as a separate token.
    if (xy[0] === "R" || xy[0] === "C") i++;
  }
  return entries;
}

/**
 * The directory the agent is allowed to work in. Every file path coming from the
 * model goes through resolve(), which rejects anything outside the root (including
 * via symlinks), inside .git, or that looks like a secret.
 */
export class Workspace {
  constructor(root, git = null) {
    this.root = root;
    this.git = git; // { toplevel, prefix } when inside a git work tree
  }

  static async open(dir) {
    let root;
    try {
      root = await fs.realpath(path.resolve(dir));
    } catch {
      throw new WorkspaceError(`Workspace directory does not exist: ${dir}`);
    }
    const stat = await fs.stat(root);
    if (!stat.isDirectory()) throw new WorkspaceError(`Workspace is not a directory: ${root}`);

    let git = null;
    const res = await runGit(root, ["rev-parse", "--show-toplevel", "--show-prefix"]);
    if (res.ok) {
      const [toplevel, prefix = ""] = res.stdout.split(/\r?\n/);
      git = { toplevel, prefix: prefix.trim() };
    }
    return new Workspace(root, git);
  }

  get isGitRepo() {
    return Boolean(this.git);
  }

  /**
   * Resolves a model-supplied path. Returns { abs, rel } with rel in posix form.
   */
  async resolve(inputPath, { forWrite = false } = {}) {
    if (typeof inputPath !== "string" || !inputPath.trim()) {
      throw new WorkspaceError("A file path is required.");
    }
    if (inputPath.includes("\0")) throw new WorkspaceError("Invalid path.");

    const abs = path.resolve(this.root, inputPath.trim());
    const rel = path.relative(this.root, abs);
    if (escapesRoot(rel)) {
      throw new WorkspaceError(`Path is outside the workspace: ${inputPath}`);
    }

    // Defeat symlink escapes: the nearest existing ancestor must also live inside the root.
    let probe = abs;
    while (!(await exists(probe))) probe = path.dirname(probe);
    const realProbe = await fs.realpath(probe);
    if (escapesRoot(path.relative(this.root, realProbe))) {
      throw new WorkspaceError(`Path resolves outside the workspace through a symlink: ${inputPath}`);
    }

    const segments = rel.split(path.sep).map((s) => s.toLowerCase());
    if (segments.includes(".git")) {
      throw new WorkspaceError("Access to .git is not allowed.");
    }
    if (forWrite && segments.includes("node_modules")) {
      throw new WorkspaceError("Writing inside node_modules is not allowed.");
    }
    if (isSecretFile(abs)) {
      throw new WorkspaceError(`Access to secret files is not allowed: ${toPosix(rel)}`);
    }
    return { abs, rel: toPosix(rel) || "." };
  }

  /** Map<workspaceRelativePath, XY> of uncommitted changes under the workspace. */
  async gitStatus() {
    if (!this.git) return new Map();
    // The pathspec keeps git from scanning the rest of an enclosing repository.
    const res = await runGit(this.root, ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--", "."]);
    if (!res.ok) return new Map();
    const result = new Map();
    for (const [repoPath, xy] of parsePorcelainZ(res.stdout)) {
      if (!repoPath.startsWith(this.git.prefix)) continue;
      result.set(repoPath.slice(this.git.prefix.length), xy);
    }
    return result;
  }

  /** Map<path, {added, removed}> for unstaged changes to tracked files. */
  async diffNumstat(paths) {
    const stats = new Map();
    if (!this.git || paths.length === 0) return stats;
    const res = await runGit(this.root, ["diff", "--numstat", "--no-renames", "-z", "--", ...paths]);
    if (!res.ok) return stats;
    for (const record of res.stdout.split("\0")) {
      const match = record.match(/^(\d+|-)\t(\d+|-)\t(.+)$/s);
      if (!match) continue;
      // numstat paths are repo-relative; convert back to workspace-relative.
      const p = match[3].startsWith(this.git.prefix) ? match[3].slice(this.git.prefix.length) : match[3];
      stats.set(p, { added: Number(match[1]) || 0, removed: Number(match[2]) || 0 });
    }
    return stats;
  }

  async listFiles(relDir = ".", maxEntries = 300) {
    const { abs, rel } = await this.resolve(relDir);
    let files = [];
    if (this.git) {
      const res = await runGit(this.root, [
        "ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", rel,
      ]);
      if (res.ok) files = [...new Set(res.stdout.split("\0").filter((f) => f && !inVendorDir(f)))];
    }
    if (!this.git || files.length === 0) {
      files = await this.#walk(abs, maxEntries * 4);
    }
    files.sort();
    return { files: files.slice(0, maxEntries), total: files.length, truncated: files.length > maxEntries };
  }

  async #walk(startAbs, limit) {
    const out = [];
    const stack = [startAbs];
    while (stack.length && out.length < limit) {
      const dir = stack.pop();
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!IGNORED_DIRS.has(entry.name)) stack.push(full);
        } else if (entry.isFile()) {
          out.push(toPosix(path.relative(this.root, full)));
          if (out.length >= limit) break;
        }
      }
    }
    return out;
  }

  /**
   * Line-oriented code search. Returns [{ path, line, text }].
   */
  async search(query, { relDir = ".", regex = false, caseSensitive = false, maxResults = 50 } = {}) {
    const { rel } = await this.resolve(relDir);
    const matches = [];

    if (this.git) {
      const args = ["grep", "-n", "-I", "--no-color", "--untracked", regex ? "-E" : "-F"];
      if (!caseSensitive) args.push("-i");
      args.push("-e", query, "--", rel);
      const res = await runGit(this.root, args);
      // Exit code 1 means "no matches"; anything else falls back to the JS walker.
      if (res.ok || res.code === 1) {
        for (const line of res.stdout.split(/\r?\n/)) {
          const m = line.match(/^(.+?):(\d+):(.*)$/);
          if (!m || isSecretFile(m[1]) || inVendorDir(m[1])) continue;
          matches.push({ path: m[1], line: Number(m[2]), text: m[3].slice(0, 300) });
          if (matches.length >= maxResults) break;
        }
        return matches;
      }
    }

    let re;
    try {
      re = new RegExp(regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), caseSensitive ? "" : "i");
    } catch (err) {
      throw new WorkspaceError(`Invalid regular expression: ${err.message}`);
    }
    const { files } = await this.listFiles(rel, 5000);
    for (const file of files) {
      if (isSecretFile(file)) continue;
      let content;
      try {
        const buf = await fs.readFile(path.join(this.root, file));
        if (buf.length > 1024 * 1024 || buf.subarray(0, 8000).includes(0)) continue;
        content = buf.toString("utf8");
      } catch {
        continue;
      }
      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (re.test(lines[i])) {
          matches.push({ path: file, line: i + 1, text: lines[i].slice(0, 300) });
          if (matches.length >= maxResults) return matches;
        }
      }
    }
    return matches;
  }

  /**
   * Validation commands inferred from project files. Only these (plus any the user
   * passes with --validate) can be pre-approved.
   */
  async detectValidationCommands() {
    const found = [];
    const has = (name) => exists(path.join(this.root, name));

    let pkg = null;
    try {
      pkg = JSON.parse(await fs.readFile(path.join(this.root, "package.json"), "utf8"));
    } catch {
      // not a Node project, or unreadable package.json
    }

    if (pkg?.scripts && typeof pkg.scripts === "object") {
      let pm = "npm";
      if (await has("pnpm-lock.yaml")) pm = "pnpm";
      else if (await has("yarn.lock")) pm = "yarn";
      else if ((await has("bun.lockb")) || (await has("bun.lock"))) pm = "bun";

      const runScript = (name) => {
        if (name === "test" && pm !== "bun") return `${pm} test`;
        return pm === "yarn" ? `yarn ${name}` : `${pm} run ${name}`;
      };

      const test = pkg.scripts.test;
      if (typeof test === "string" && !/no test specified/i.test(test)) {
        found.push({ command: runScript("test"), kind: "test" });
      }
      for (const name of ["typecheck", "type-check", "check-types", "tsc"]) {
        if (typeof pkg.scripts[name] === "string") {
          found.push({ command: runScript(name), kind: "typecheck" });
          break;
        }
      }
      if (typeof pkg.scripts.lint === "string") found.push({ command: runScript("lint"), kind: "lint" });
    }

    if (await has("pytest.ini")) {
      found.push({ command: "python -m pytest", kind: "test" });
    } else if (await has("pyproject.toml")) {
      const toml = await fs.readFile(path.join(this.root, "pyproject.toml"), "utf8").catch(() => "");
      if (toml.includes("[tool.pytest")) found.push({ command: "python -m pytest", kind: "test" });
    }
    if (await has("go.mod")) found.push({ command: "go test ./...", kind: "test" });
    if (await has("Cargo.toml")) found.push({ command: "cargo test", kind: "test" });

    return found;
  }

  /** Short description of the workspace for the model's first message. */
  async describe({ dirty, validation }) {
    const lines = [`Workspace root: ${path.basename(this.root)} (${this.root})`];
    if (this.git) {
      const branch = await runGit(this.root, ["branch", "--show-current"]);
      lines.push(`Git: yes (branch: ${branch.stdout.trim() || "detached"})`);
      if (dirty.size > 0) {
        const shown = [...dirty.keys()].slice(0, 20);
        lines.push(
          `Uncommitted changes before this run (belong to the user — do not modify unless the task requires it): ` +
            shown.join(", ") + (dirty.size > shown.length ? ` … (+${dirty.size - shown.length} more)` : "")
        );
      }
    } else {
      lines.push("Git: no (changes cannot be diffed with git)");
    }

    try {
      const entries = await fs.readdir(this.root, { withFileTypes: true });
      const names = entries
        .filter((e) => e.name !== ".git")
        .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
        .sort()
        .slice(0, 40);
      lines.push(`Top-level entries: ${names.join(", ")}`);
    } catch {
      // ignore
    }

    try {
      const pkg = JSON.parse(await fs.readFile(path.join(this.root, "package.json"), "utf8"));
      const scripts = Object.keys(pkg.scripts || {});
      lines.push(`package.json: name=${pkg.name || "(none)"}${pkg.type ? `, type=${pkg.type}` : ""}, scripts: ${scripts.join(", ") || "(none)"}`);
    } catch {
      // ignore
    }

    lines.push(
      validation.length > 0
        ? `Detected validation commands: ${validation.map((v) => v.command).join(", ")}`
        : "Detected validation commands: none"
    );
    return lines.join("\n");
  }
}
