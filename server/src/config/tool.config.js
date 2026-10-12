import { tool } from "ai";
import { z } from "zod";
import { promises as fs } from "fs";
import { execFile } from "child_process";
import dns from "dns";
import net from "net";
import { Workspace } from "../agent/workspace.js";
import { buildCommandEnv } from "../agent/command-runner.js";

const execFileAsync = (file, args, options) =>
  new Promise((resolve) => {
    execFile(file, args, options, (error, stdout, stderr) => {
      resolve({ error, stdout: String(stdout ?? ""), stderr: String(stderr ?? "") });
    });
  });

// ---------------------------------------------------------------------------
// Approval hook for running model-written code. Chat UIs install a prompt with
// setCodeExecutionApprover(); without one, execution is refused.
// ---------------------------------------------------------------------------
let codeExecutionApprover = async () => false;

export function setCodeExecutionApprover(fn) {
  codeExecutionApprover = typeof fn === "function" ? fn : async () => false;
}

// ---------------------------------------------------------------------------
// Calculator: only numbers, operators, parentheses and Math.* members may
// appear, so the expression cannot reference anything else before evaluation.
// ---------------------------------------------------------------------------
const MATH_MEMBERS = [
  "abs", "acos", "asin", "atan", "atan2", "cbrt", "ceil", "cos", "exp", "floor", "hypot", "log",
  "log10", "log2", "max", "min", "pow", "round", "sign", "sin", "sqrt", "tan", "trunc", "PI", "E",
];
const MATH_TOKEN = new RegExp(`^(?:\\s+|\\d+(?:\\.\\d+)?(?:e[+-]?\\d+)?|\\.\\d+|\\*\\*|[-+*/%^(),]|Math\\.(?:${MATH_MEMBERS.join("|")})\\b)`);

export function evaluateMathExpression(expression) {
  const expr = String(expression ?? "").trim();
  if (!expr || expr.length > 500) throw new Error("Expression is empty or too long.");
  let rest = expr;
  while (rest.length > 0) {
    const m = rest.match(MATH_TOKEN);
    if (!m) throw new Error(`Unsupported token near "${rest.slice(0, 15)}"`);
    rest = rest.slice(m[0].length);
  }
  const value = Function(`"use strict"; return (${expr.replace(/\^/g, "**")});`)();
  if (typeof value !== "number" || Number.isNaN(value)) throw new Error("Expression did not evaluate to a number.");
  return value;
}

// ---------------------------------------------------------------------------
// URL fetching: http(s) only, and never to loopback/private networks, so a
// prompt-injected page can't make the CLI read services on the user's network.
// ---------------------------------------------------------------------------
function isPrivateAddress(address) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const v6 = address.toLowerCase();
  if (v6.startsWith("::ffff:")) return isPrivateAddress(v6.slice(7));
  return v6 === "::1" || v6 === "::" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80");
}

export async function assertPublicHttpUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only http and https URLs are allowed.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost")) throw new Error("Local addresses are not allowed.");
  const addresses = net.isIP(host) ? [{ address: host }] : await dns.promises.lookup(host, { all: true });
  if (addresses.some((a) => isPrivateAddress(a.address))) throw new Error("Private network addresses are not allowed.");
  return url;
}

/**
 * Developer tools for the interactive Tools mode.
 */
export const availableTools = [
  {
    id: "web_search",
    name: "Web & Google Search",
    description: "Search the live web for real-time documentation, solutions, error fixes, and technical news.",
    getTool: () =>
      tool({
        description: "Search the live internet for recent documentation, packages, error solutions, or technical facts.",
        inputSchema: z.object({
          query: z.string().min(1).describe("The search query to look up on the web"),
        }),
        execute: async ({ query }) => {
          try {
            const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
              headers: {
                "User-Agent":
                  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              },
              signal: AbortSignal.timeout(7000),
            });
            if (!res.ok) throw new Error(`Search request failed with HTTP ${res.status}`);
            const html = await res.text();

            const results = [];
            const blocks = html.split('<div class="result results_links');
            for (let i = 1; i < Math.min(blocks.length, 6); i++) {
              const block = blocks[i];
              const titleMatch =
                block.match(/<h2[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i) || block.match(/<a class="result__a"[^>]*>([\s\S]*?)<\/a>/i);
              const snippetMatch = block.match(/<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i);
              const urlMatch = block.match(/<a class="result__url"[^>]*href="([^"]+)"/i) || block.match(/href="([^"]+)"/i);

              const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "";
              const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, "").trim() : "";
              let url = urlMatch ? urlMatch[1].trim() : "";
              const uddg = url.match(/uddg=([^&]+)/);
              if (uddg) {
                try {
                  url = decodeURIComponent(uddg[1]);
                } catch {}
              }
              if (title || snippet) results.push({ title, snippet, url });
            }
            return { query, results, total: results.length, success: true };
          } catch (err) {
            return { query, error: err.message, results: [], success: false };
          }
        },
      }),
    enabled: false,
  },
  {
    id: "code_execution",
    name: "Code Execution & Problem Solver",
    description: "Run JavaScript or Python snippets on your machine (asks before each run).",
    getTool: () =>
      tool({
        description:
          "Executes a short JavaScript or Python snippet locally and returns stdout/stderr. The user must approve each run.",
        inputSchema: z.object({
          language: z.enum(["javascript", "python"]).describe("Language of the snippet"),
          code: z.string().min(1).max(20_000).describe("The code to execute"),
        }),
        execute: async ({ language, code }) => {
          if (!(await codeExecutionApprover(language, code))) {
            return { success: false, error: "The user did not approve running this code." };
          }
          // No shell: the code is passed as a single argument, so it can't inject shell syntax.
          const [file, flag] = language === "python" ? [process.platform === "win32" ? "python" : "python3", "-c"] : ["node", "-e"];
          const { error, stdout, stderr } = await execFileAsync(file, [flag, code], {
            timeout: 10_000,
            maxBuffer: 1024 * 1024,
            windowsHide: true,
            env: buildCommandEnv(),
          });
          return {
            language,
            exitCode: error ? (typeof error.code === "number" ? error.code : null) : 0,
            timedOut: Boolean(error?.killed),
            stdout: stdout.trim().slice(0, 4000),
            stderr: stderr.trim().slice(0, 4000),
            success: !error,
          };
        },
      }),
    enabled: false,
  },
  {
    id: "calculator",
    name: "Calculator & Math Engine",
    description: "Perform mathematical calculations, formulas, unit conversions, and algebraic computations.",
    getTool: () =>
      tool({
        description: "Evaluates an arithmetic expression. Supports + - * / % ^ ** parentheses and Math functions (e.g. Math.sqrt).",
        inputSchema: z.object({
          expression: z.string().min(1).describe('The expression to evaluate, e.g. "5 + 8" or "Math.sqrt(256) * 12"'),
        }),
        execute: async ({ expression }) => {
          try {
            return { expression, result: String(evaluateMathExpression(expression)), success: true };
          } catch (err) {
            return { expression, error: err.message, success: false };
          }
        },
      }),
    enabled: false,
  },
  {
    id: "workspace_reader",
    name: "Workspace File Reader",
    description: "Read project source files, package.json, configs, and logs in the active directory.",
    getTool: () =>
      tool({
        description: "Read a text file inside the current project directory (paths outside it and secret files are refused).",
        inputSchema: z.object({
          path: z.string().min(1).describe("Path relative to the current project directory"),
        }),
        execute: async ({ path: filePath }) => {
          try {
            const workspace = await Workspace.open(process.cwd());
            const { abs, rel } = await workspace.resolve(filePath);
            const stat = await fs.stat(abs);
            if (!stat.isFile()) throw new Error(`${rel} is not a file.`);
            if (stat.size > 1024 * 1024) throw new Error(`${rel} is too large to read.`);
            const content = await fs.readFile(abs, "utf8");
            return {
              filePath: rel,
              content: content.length > 4000 ? content.slice(0, 4000) + "\n...[truncated]" : content,
              lines: content.split("\n").length,
              success: true,
            };
          } catch (err) {
            return { filePath, error: err.message, success: false };
          }
        },
      }),
    enabled: false,
  },
  {
    id: "git_inspector",
    name: "Git Repository Inspector",
    description: "Inspect git status, current branch, recent commits, and uncommitted diffs.",
    getTool: () =>
      tool({
        description: "Inspects git repository status, latest commit history, current branch, or a diff summary.",
        inputSchema: z.object({
          action: z.enum(["status", "log", "branch", "diff"]).describe("Which git information to show"),
        }),
        execute: async ({ action }) => {
          const args = {
            status: ["status", "--short"],
            log: ["log", "-n", "5", "--oneline"],
            branch: ["branch", "--show-current"],
            diff: ["diff", "--stat"],
          }[action];
          const { error, stdout, stderr } = await execFileAsync("git", args, { timeout: 4000, windowsHide: true });
          if (error) return { action, error: stderr.trim() || error.message, success: false };
          return { action, command: `git ${args.join(" ")}`, output: stdout.trim() || "(clean repository / no output)", success: true };
        },
      }),
    enabled: false,
  },
  {
    id: "fetch_url",
    name: "Web URL Reader",
    description: "Fetch and analyze the text or JSON content from a public web URL.",
    getTool: () =>
      tool({
        description: "Fetch and read text content from a public HTTP/HTTPS URL.",
        inputSchema: z.object({
          url: z.string().min(1).describe("The full URL to fetch content from"),
        }),
        execute: async ({ url }) => {
          try {
            await assertPublicHttpUrl(url);
            const res = await fetch(url, {
              headers: { "User-Agent": "Lumina-CLI/1.0" },
              redirect: "error", // a redirect could point at a private address
              signal: AbortSignal.timeout(6000),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
            const content = (await res.text()).slice(0, 3000);
            return { url, content, length: content.length, success: true };
          } catch (err) {
            return { url, error: err.message, success: false };
          }
        },
      }),
    enabled: false,
  },
  {
    id: "system_info",
    name: "System Diagnostics",
    description: "Retrieve local developer environment info (Node version, OS, architecture, working directory).",
    getTool: () =>
      tool({
        description: "Returns the developer machine's OS platform, architecture, Node.js version, and working directory.",
        inputSchema: z.object({}),
        execute: async () => ({
          platform: process.platform,
          arch: process.arch,
          nodeVersion: process.version,
          cwd: process.cwd(),
          timestamp: new Date().toISOString(),
          uptimeSeconds: Math.round(process.uptime()),
        }),
      }),
    enabled: false,
  },
];

/**
 * Get enabled tools as a tools object for AI SDK
 */
export function getEnabledTools() {
  const tools = {};
  for (const toolConfig of availableTools) {
    if (toolConfig.enabled) tools[toolConfig.id] = toolConfig.getTool();
  }
  return Object.keys(tools).length > 0 ? tools : undefined;
}

/**
 * Toggle a tool's enabled state
 */
export function toggleTool(toolId) {
  const t = availableTools.find((x) => x.id === toolId);
  if (t) {
    t.enabled = !t.enabled;
    return t.enabled;
  }
  return false;
}

/**
 * Enable specific tools
 */
export function enableTools(toolIds) {
  availableTools.forEach((t) => {
    t.enabled = toolIds.includes(t.id);
  });
}

/**
 * Get all enabled tool names
 */
export function getEnabledToolNames() {
  return availableTools.filter((t) => t.enabled).map((t) => t.name);
}

/**
 * Reset all tools (disable all)
 */
export function resetTools() {
  availableTools.forEach((t) => {
    t.enabled = false;
  });
}
