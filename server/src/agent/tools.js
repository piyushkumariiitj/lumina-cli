import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { WorkspaceError } from "./workspace.js";
import { classifyCommand, normalizeCommand } from "./command-policy.js";
import { runCommand } from "./command-runner.js";

const READ_MAX_LINES = 400;
const READ_MAX_CHARS = 40_000;
const READ_MAX_FILE_BYTES = 2 * 1024 * 1024;

const pathField = z.string().describe("Path relative to the workspace root");

export const TOOL_DEFINITIONS = {
  list_files: {
    description:
      "List files in the workspace (respects .gitignore in git repos). Use to discover project structure.",
    inputSchema: z.object({
      path: z.string().optional().describe("Directory relative to the workspace root (default '.')"),
      maxEntries: z.number().int().min(1).max(1000).optional().describe("Maximum entries to return (default 300)"),
    }),
  },
  read_file: {
    description: `Read a text file. Returns at most ${READ_MAX_LINES} lines per call; use startLine/endLine for large files.`,
    inputSchema: z.object({
      path: pathField,
      startLine: z.number().int().min(1).optional().describe("First line to return (1-based)"),
      endLine: z.number().int().min(1).optional().describe("Last line to return (inclusive)"),
    }),
  },
  search_code: {
    description: "Search file contents line by line. Returns matching lines with file paths and line numbers.",
    inputSchema: z.object({
      query: z.string().min(1).describe("Text to search for (or a regular expression when regex=true)"),
      path: z.string().optional().describe("Directory to search in (default '.')"),
      regex: z.boolean().optional().describe("Treat query as an extended regular expression"),
      caseSensitive: z.boolean().optional(),
    }),
  },
  submit_plan: {
    description:
      "Submit your implementation plan for approval. Required before any file can be modified. " +
      "Keep it concise and specific to this repository.",
    inputSchema: z.object({
      summary: z.string().describe("One or two sentences: what you will change and why"),
      steps: z.array(z.string()).min(1).max(12).describe("Ordered implementation steps"),
      filesToChange: z.array(z.string()).optional().describe("Files you expect to create or modify"),
      validationCommands: z
        .array(z.string())
        .optional()
        .describe("Commands that verify the change, e.g. the project's test command"),
    }),
  },
  edit_file: {
    description:
      "Replace an exact snippet in an existing file. oldText must match the file exactly (including indentation) " +
      "and be unique unless replaceAll is true. Prefer this over write_file for existing files.",
    inputSchema: z.object({
      path: pathField,
      oldText: z.string().min(1).describe("Exact text currently in the file"),
      newText: z.string().describe("Replacement text"),
      replaceAll: z.boolean().optional().describe("Replace every occurrence instead of requiring a unique match"),
    }),
  },
  write_file: {
    description: "Create a new file, or completely overwrite an existing one with the given content.",
    inputSchema: z.object({
      path: pathField,
      content: z.string().describe("Full file content"),
    }),
  },
  run_command: {
    description:
      "Run a shell command in the workspace root (no stdin, with a timeout). Use it for tests, linters and type checks. " +
      "Destructive commands are blocked; others may need user approval. Do not start servers or watch modes.",
    inputSchema: z.object({
      command: z.string().min(1),
      purpose: z.string().optional().describe("Why you are running it"),
    }),
  },
  finish: {
    description:
      "Call when the task is complete (or cannot be completed). The harness then runs validation itself and reports the real results.",
    inputSchema: z.object({
      summary: z.string().describe("What you changed and anything the user should know. Do not claim results you have not observed."),
    }),
  },
};

const WRITE_TOOLS = new Set(["edit_file", "write_file"]);

class ToolError extends Error {}

function countOccurrences(haystack, needle) {
  let count = 0;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    count++;
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return count;
}

/**
 * Executes tool calls against the run state. Every executor returns a plain
 * JSON-serializable object; failures are returned as { ok: false, error }.
 */
export class ToolExecutor {
  constructor(ctx) {
    this.ctx = ctx; // { workspace, state, limits, approver, emit, preApproved }
  }

  async execute(name, input) {
    const handler = this[`tool_${name}`];
    if (!handler) return { ok: false, error: `Unknown tool: ${name}` };
    if (WRITE_TOOLS.has(name) && !this.ctx.state.planApproved) {
      return {
        ok: false,
        error: "No approved plan yet. Inspect the code, then call submit_plan before modifying files.",
      };
    }
    try {
      return await handler.call(this, input ?? {});
    } catch (err) {
      if (err instanceof ToolError || err instanceof WorkspaceError) {
        return { ok: false, error: err.message };
      }
      return { ok: false, error: `Tool failed: ${err.message}` };
    }
  }

  async tool_list_files({ path: dir = ".", maxEntries = 300 }) {
    const result = await this.ctx.workspace.listFiles(dir, maxEntries);
    return { ok: true, ...result };
  }

  async tool_read_file({ path: filePath, startLine, endLine }) {
    const { abs, rel } = await this.ctx.workspace.resolve(filePath);
    let stat;
    try {
      stat = await fs.stat(abs);
    } catch {
      throw new ToolError(`File not found: ${rel}`);
    }
    if (stat.isDirectory()) throw new ToolError(`${rel} is a directory; use list_files.`);
    if (stat.size > READ_MAX_FILE_BYTES) throw new ToolError(`${rel} is too large to read (${stat.size} bytes).`);

    const buf = await fs.readFile(abs);
    if (buf.subarray(0, 8000).includes(0)) throw new ToolError(`${rel} looks like a binary file.`);

    const lines = buf.toString("utf8").split(/\r?\n/);
    const start = Math.max(1, startLine ?? 1);
    let end = Math.min(lines.length, endLine ?? start + READ_MAX_LINES - 1, start + READ_MAX_LINES - 1);
    let content = lines.slice(start - 1, end).join("\n");
    if (content.length > READ_MAX_CHARS) {
      content = content.slice(0, READ_MAX_CHARS);
      end = start + content.split("\n").length - 1;
    }
    return {
      ok: true,
      path: rel,
      totalLines: lines.length,
      startLine: start,
      endLine: end,
      truncated: end < lines.length || start > 1,
      content,
    };
  }

  async tool_search_code({ query, path: dir = ".", regex = false, caseSensitive = false }) {
    const matches = await this.ctx.workspace.search(query, { relDir: dir, regex, caseSensitive, maxResults: 50 });
    return { ok: true, matches, truncated: matches.length >= 50 };
  }

  async tool_submit_plan(plan) {
    const { state, approver, emit, limits } = this.ctx;
    if (state.planApproved) {
      return { ok: true, note: "A plan is already approved; continue implementing it." };
    }
    state.plan = plan;
    emit({ type: "plan", plan });

    const decision = await approver.approvePlan(plan);
    if (decision.decision === "approve") {
      state.planApproved = true;
      if (limits.planOnly) state.stopRequested = { status: "planned", reason: "Stopped after planning (--plan-only)." };
      return { ok: true, approved: true, message: "Plan approved. Implement it now." };
    }
    if (decision.decision === "revise" && state.planRevisions < limits.maxPlanRevisions) {
      state.planRevisions++;
      return {
        ok: false,
        approved: false,
        error: `The user asked for changes to the plan: ${decision.feedback || "(no details)"}. Submit a revised plan.`,
      };
    }
    state.stopRequested = { status: "aborted", reason: "Plan was rejected by the user." };
    return { ok: false, approved: false, error: "Plan rejected by the user. Stop." };
  }

  /** Shared guard for both write tools. Returns resolved path info. */
  async #prepareWrite(filePath, newContentLength) {
    const { workspace, state, limits, approver } = this.ctx;
    const target = await workspace.resolve(filePath, { forWrite: true });

    if (newContentLength > limits.maxWriteBytes) {
      throw new ToolError(`Refusing to write ${newContentLength} bytes (limit ${limits.maxWriteBytes}).`);
    }
    if (!state.changedFiles.has(target.rel) && state.changedFiles.size >= limits.maxFilesChanged) {
      throw new ToolError(`File change limit reached (${limits.maxFilesChanged} files).`);
    }

    // Files the user had already modified before this run are theirs: ask first.
    if (state.baselineDirty.has(target.rel) && !state.approvedDirtyFiles.has(target.rel)) {
      const ok = limits.allowDirty || (await approver.approveDirtyFileEdit(target.rel));
      if (!ok) {
        throw new ToolError(
          `${target.rel} has uncommitted changes made before this run and the user did not approve modifying it.`
        );
      }
      state.approvedDirtyFiles.add(target.rel);
    }
    return target;
  }

  #recordChange(rel, existed) {
    const { state, emit } = this.ctx;
    if (!state.changedFiles.has(rel)) {
      state.changedFiles.set(rel, { action: existed ? "modified" : "created" });
    }
    emit({ type: "file", path: rel, action: state.changedFiles.get(rel).action });
  }

  async tool_edit_file({ path: filePath, oldText, newText, replaceAll = false }) {
    const { abs, rel } = await this.ctx.workspace.resolve(filePath, { forWrite: true });
    let original;
    try {
      original = await fs.readFile(abs, "utf8");
    } catch {
      throw new ToolError(`File not found: ${rel}. Use write_file to create new files.`);
    }

    let search = oldText;
    let replacement = newText;
    let count = countOccurrences(original, search);
    // Models send LF; files on Windows are often CRLF.
    if (count === 0 && original.includes("\r\n") && !oldText.includes("\r\n")) {
      search = oldText.replace(/\n/g, "\r\n");
      replacement = newText.replace(/\r?\n/g, "\r\n");
      count = countOccurrences(original, search);
    }
    if (count === 0) {
      throw new ToolError(`oldText was not found in ${rel}. Re-read the file and copy the exact text, including whitespace.`);
    }
    if (count > 1 && !replaceAll) {
      throw new ToolError(`oldText matches ${count} places in ${rel}. Include more surrounding context, or set replaceAll.`);
    }

    const updated = replaceAll ? original.split(search).join(replacement) : original.replace(search, () => replacement);
    await this.#prepareWrite(filePath, Buffer.byteLength(updated));
    await fs.writeFile(abs, updated, "utf8");
    this.#recordChange(rel, true);
    return { ok: true, path: rel, replacements: replaceAll ? count : 1 };
  }

  async tool_write_file({ path: filePath, content }) {
    const { abs, rel } = await this.#prepareWrite(filePath, Buffer.byteLength(content));
    let existed = true;
    try {
      const stat = await fs.stat(abs);
      if (stat.isDirectory()) throw new ToolError(`${rel} is a directory.`);
    } catch (err) {
      if (err instanceof ToolError) throw err;
      existed = false;
    }
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content, "utf8");
    this.#recordChange(rel, existed);
    return { ok: true, path: rel, action: existed ? "overwritten" : "created", bytes: Buffer.byteLength(content) };
  }

  async tool_run_command({ command, purpose }) {
    const result = await executeCommand(this.ctx, command, { purpose, source: "agent" });
    if (result.status !== "ran") return { ok: false, ...result };
    return {
      ok: result.exitCode === 0,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      durationMs: result.durationMs,
      output: result.output,
    };
  }

  async tool_finish({ summary }) {
    this.ctx.state.finishRequested = { summary };
    return { ok: true, message: "Finish recorded. The harness will now verify the changes." };
  }
}

/**
 * Policy check → approval → execution → recording. Used for both agent-requested
 * commands and the harness's own verification runs.
 */
export async function executeCommand(ctx, command, { purpose = "", source }) {
  const { workspace, state, limits, approver, emit, preApproved } = ctx;
  const normalized = normalizeCommand(command);
  const verdict = classifyCommand(normalized, { preApproved: new Set([...preApproved, ...state.approvedCommands]) });

  if (verdict.decision === "blocked") {
    state.commands.push({ command: normalized, source, status: "blocked", reason: verdict.reason });
    emit({ type: "command-blocked", command: normalized, reason: verdict.reason });
    return { status: "blocked", error: `Command blocked by safety policy (${verdict.reason}). Do not retry it.` };
  }

  if (verdict.decision === "ask") {
    const answer = await approver.approveCommand(normalized, { purpose, reason: verdict.reason });
    if (answer === "deny") {
      state.commands.push({ command: normalized, source, status: "denied", reason: verdict.reason });
      emit({ type: "command-denied", command: normalized });
      return { status: "denied", error: "The user did not approve this command." };
    }
    if (answer === "always") state.approvedCommands.add(normalized);
  }

  emit({ type: "command-start", command: normalized, source });
  const result = await runCommand(normalized, {
    cwd: workspace.root,
    timeoutMs: limits.commandTimeoutMs,
  });
  const record = {
    command: normalized,
    source,
    status: "ran",
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    durationMs: result.durationMs,
    output: result.output,
    error: result.error,
  };
  state.commands.push(record);
  emit({ type: "command-end", ...record });

  return { status: "ran", ...result };
}
