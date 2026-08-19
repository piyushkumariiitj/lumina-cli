import { tool } from "ai";
import { z } from "zod";
import chalk from "chalk";
import { promises as fs } from "fs";
import path from "path";
import { exec } from "child_process";
import util from "util";

const execPromise = util.promisify(exec);

let lastUserQuery = "";

export function setLastUserQuery(query) {
  lastUserQuery = query;
}

/**
 * Universal Developer AI Tools configuration compatible with Groq & LLMs
 */
export const availableTools = [
  {
    id: "web_search",
    name: "Web & Google Search",
    description: "Search the live web for real-time documentation, solutions, error fixes, and technical news.",
    getTool: () =>
      tool({
        description: "Search the live internet for recent documentation, packages, error solutions, or technical facts.",
        parameters: z.object({
          query: z
            .string()
            .optional()
            .describe("The search query to look up on the web"),
        }),
        execute: async (args) => {
          try {
            let q =
              typeof args === "string"
                ? args
                : args?.query || args?.input || args?.q || "";

            if (!q && lastUserQuery) {
              q = lastUserQuery;
            }

            if (!q) {
              return { error: "No search query provided", success: false };
            }

            const res = await fetch(
              `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`,
              {
                headers: {
                  "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                },
                signal: AbortSignal.timeout(7000),
              }
            );

            if (!res.ok) throw new Error(`Search request failed with HTTP ${res.status}`);
            const html = await res.text();

            const results = [];
            const blocks = html.split('<div class="result results_links');
            for (let i = 1; i < Math.min(blocks.length, 6); i++) {
              const block = blocks[i];
              const titleMatch =
                block.match(/<h2[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i) ||
                block.match(/<a class="result__a"[^>]*>([\s\S]*?)<\/a>/i);
              const snippetMatch = block.match(
                /<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i
              );
              const urlMatch =
                block.match(/<a class="result__url"[^>]*href="([^"]+)"/i) ||
                block.match(/href="([^"]+)"/i);

              const title = titleMatch
                ? titleMatch[1].replace(/<[^>]+>/g, "").trim()
                : "";
              const snippet = snippetMatch
                ? snippetMatch[1].replace(/<[^>]+>/g, "").trim()
                : "";
              let url = urlMatch ? urlMatch[1].trim() : "";

              if (url.includes("uddg=")) {
                try {
                  const match = url.match(/uddg=([^&]+)/);
                  if (match) url = decodeURIComponent(match[1]);
                } catch {}
              }

              if (title || snippet) {
                results.push({ title, snippet, url });
              }
            }

            return {
              query: q,
              results,
              total: results.length,
              success: true,
            };
          } catch (err) {
            return { query: args, error: err.message, results: [], success: false };
          }
        },
      }),
    enabled: false,
  },
  {
    id: "code_execution",
    name: "Code Execution & Problem Solver",
    description: "Safely execute JavaScript or Python code snippets to test logic, algorithms, regex, or math.",
    getTool: () =>
      tool({
        description: "Executes a JavaScript or Python code snippet and captures stdout, stderr, and output.",
        parameters: z.object({
          language: z
            .enum(["javascript", "js", "python", "py"])
            .optional()
            .describe("Language to execute: 'javascript' or 'python'"),
          code: z
            .string()
            .optional()
            .describe("The executable code snippet string"),
        }),
        execute: async (args) => {
          try {
            const lang = (args?.language || "javascript").toLowerCase();
            let code =
              typeof args === "string" ? args : args?.code || args?.input || "";

            if (!code && lastUserQuery) {
              const codeBlockMatch = lastUserQuery.match(/```(?:js|javascript|py|python)?\s*([\s\S]*?)```/);
              if (codeBlockMatch) {
                code = codeBlockMatch[1];
              }
            }

            if (!code) {
              return { error: "No code provided to execute", success: false };
            }

            if (lang === "python" || lang === "py") {
              const { stdout, stderr } = await execPromise(
                `python -c "${code.replace(/"/g, '\\"')}"`,
                {
                  timeout: 6000,
                  maxBuffer: 1024 * 1024,
                }
              );
              return {
                language: "python",
                output: stdout.trim() || (stderr ? `Stderr: ${stderr.trim()}` : "Executed with no output"),
                success: !stderr,
              };
            } else {
              const { stdout, stderr } = await execPromise(
                `node -e "${code.replace(/"/g, '\\"')}"`,
                {
                  timeout: 6000,
                  maxBuffer: 1024 * 1024,
                }
              );
              return {
                language: "javascript",
                output: stdout.trim() || (stderr ? `Stderr: ${stderr.trim()}` : "Executed with no output"),
                success: !stderr,
              };
            }
          } catch (err) {
            return {
              error: err.message,
              stdout: err.stdout ? String(err.stdout).trim() : "",
              stderr: err.stderr ? String(err.stderr).trim() : "",
              success: false,
            };
          }
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
        description: "Calculates the numerical result of a mathematical formula or expression.",
        parameters: z.object({
          expression: z
            .string()
            .optional()
            .describe('The mathematical expression to evaluate, e.g. "5 + 8" or "Math.sqrt(256) * 12"'),
        }),
        execute: async (args) => {
          try {
            let expr =
              typeof args === "string"
                ? args
                : args?.expression || args?.expr || args?.input || args?.formula || args?.query || "";

            if (!expr && lastUserQuery) {
              const match = lastUserQuery.match(/(\d+[\s*+\-/^%.()]+[\d\s*+\-/^%.()]*)/);
              if (match && match[1]) {
                expr = match[1].trim();
              }
            }

            if (!expr && typeof args === "object") {
              const str = JSON.stringify(args);
              const match = str.match(/([0-9+\-*/().^ %]+)/);
              if (match && match[1] && match[1].trim().length >= 3) {
                expr = match[1].trim();
              }
            }

            if (!expr || typeof expr !== "string" || !expr.trim()) {
              return {
                result: "No valid mathematical expression provided",
                success: false,
              };
            }

            const sanitized = expr
              .replace(/[^0-9+\-*/().,MathPIEsincostansqrtpowabslogminmax \t\n]/g, "")
              .trim();

            const fn = new Function(`return (${sanitized || expr})`);
            const val = fn();
            return { expression: expr, result: String(val), success: true };
          } catch (err) {
            return { expression: args, error: err.message, success: false };
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
        description: "Read the contents of a local file in the developer's project directory.",
        parameters: z.object({
          filePath: z
            .string()
            .optional()
            .describe("Relative or absolute path to the file to inspect"),
        }),
        execute: async (args) => {
          try {
            let targetPath =
              typeof args === "string"
                ? args
                : args?.filePath || args?.path || args?.file || "";

            if (!targetPath && lastUserQuery) {
              const match = lastUserQuery.match(/([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]{1,6})/);
              if (match) {
                targetPath = match[1];
              }
            }

            if (!targetPath) {
              return { error: "No file path provided", success: false };
            }

            const resolvedPath = path.resolve(process.cwd(), targetPath);
            const content = await fs.readFile(resolvedPath, "utf8");
            return {
              filePath: targetPath,
              content: content.length > 4000 ? content.slice(0, 4000) + "\n...[truncated]" : content,
              lines: content.split("\n").length,
              success: true,
            };
          } catch (err) {
            return { filePath: args, error: err.message, success: false };
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
        description: "Inspects git repository status, latest commit history, or diffs in the working directory.",
        parameters: z.object({
          action: z
            .enum(["status", "log", "branch", "diff"])
            .optional()
            .describe("The git command action: 'status', 'log', 'branch', or 'diff'"),
        }),
        execute: async (args) => {
          try {
            const action = (args?.action || "status").toLowerCase();
            let cmd = "git status --short";
            if (action === "log") cmd = "git log -n 5 --oneline";
            if (action === "branch") cmd = "git branch --show-current";
            if (action === "diff") cmd = "git diff --stat";

            const { stdout, stderr } = await execPromise(cmd, {
              timeout: 4000,
            });

            return {
              action,
              command: cmd,
              output: stdout.trim() || "(clean repository / no output)",
              stderr: stderr.trim(),
              success: true,
            };
          } catch (err) {
            return { error: err.message, success: false };
          }
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
        description: "Fetch and read text content from a given public HTTP/HTTPS URL.",
        parameters: z.object({
          url: z.string().optional().describe("The full URL to fetch content from"),
        }),
        execute: async (args) => {
          try {
            let targetUrl =
              typeof args === "string" ? args : args?.url || args?.input || "";

            if (!targetUrl && lastUserQuery) {
              const match = lastUserQuery.match(/https?:\/\/[^\s]+/);
              if (match) {
                targetUrl = match[0];
              }
            }

            if (!targetUrl) {
              return { error: "No URL provided", success: false };
            }
            const res = await fetch(targetUrl, {
              headers: { "User-Agent": "Lumina-CLI/1.0" },
              signal: AbortSignal.timeout(6000),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
            const rawText = await res.text();
            const content = rawText.slice(0, 3000);
            return { url: targetUrl, content, length: content.length, success: true };
          } catch (err) {
            return { url: args, error: err.message, success: false };
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
        parameters: z.object({}),
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

  try {
    for (const toolConfig of availableTools) {
      if (toolConfig.enabled) {
        tools[toolConfig.id] = toolConfig.getTool();
      }
    }

    return Object.keys(tools).length > 0 ? tools : undefined;
  } catch (error) {
    return undefined;
  }
}

/**
 * Toggle a tool's enabled state
 */
export function toggleTool(toolId) {
  const tool = availableTools.find((t) => t.id === toolId);
  if (tool) {
    tool.enabled = !tool.enabled;
    return tool.enabled;
  }
  return false;
}

/**
 * Enable specific tools
 */
export function enableTools(toolIds) {
  availableTools.forEach((tool) => {
    tool.enabled = toolIds.includes(tool.id);
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
  availableTools.forEach((tool) => {
    tool.enabled = false;
  });
}