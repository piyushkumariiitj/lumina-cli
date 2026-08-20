import { config } from "../../config/groq.config.js";
import { theme, symbols, tag } from "./theme.js";

/**
 * Minimalist Header for Lumina CLI
 * Uses accent color (#e8b339) for brand glyph
 */
export function renderBanner() {
  const glyph = theme.accentBold("✦");
  const brand = theme.whiteBold("Lumina CLI");
  const version = theme.muted("v1.0.0");
  const model = theme.muted(`• ${config.model || "Groq LLM"}`);

  console.log(`\n${glyph} ${brand} ${version} ${model}\n`);
}

/**
 * Clean User Profile overview
 */
export function renderUserCard(user) {
  const glyph = theme.accent("✦");
  const name = theme.whiteBold(user.name || "Developer");
  const email = theme.muted(user.email ? `<${user.email}>` : "");
  const model = theme.tool(config.model || "Groq");
  const status = theme.success("Active");

  console.log(
    `  ${glyph} ${name} ${email}\n` +
    `  ${theme.muted("• Engine:")} ${model}  ${theme.muted("• Status:")} ${status}\n`
  );
}

/**
 * Minimalist Session Header
 */
export function renderSessionHeader({ title, mode = "chat", conversationId = "", activeTools = [] }) {
  const modeColors = {
    chat: theme.user,
    tool: theme.tool,
    agent: theme.agent,
  };

  const modeColor = modeColors[mode] || theme.tool;
  const divider = theme.border("─".repeat(45));

  console.log(`\n${theme.accent("──")} ${modeColor.bold(`Lumina [${mode.toUpperCase()}]`)} ${divider}`);
  if (title && title !== `New ${mode} conversation`) {
    console.log(`  ${theme.muted("Topic:")} ${theme.white(title)}`);
  }
  if (mode === "tool" && activeTools.length > 0) {
    console.log(`  ${theme.muted("Tools:")} ${theme.tool(activeTools.join(", "))}`);
  }
  console.log(`  ${theme.muted("Commands: 'exit' to quit | '/clear' to reset")}\n`);
}

/**
 * Human-Friendly Tool execution indicator
 */
export function renderToolExecution(toolName, args = {}, fallbackQuery = "") {
  const name = (toolName || "").toLowerCase();

  let queryText = "";
  if (args && typeof args === "object") {
    queryText = args.query || args.q || args.input || args.expression || args.expr || args.filePath || args.path || args.code || args.url || "";
  } else if (typeof args === "string" && args.trim() && args.trim() !== "{}") {
    queryText = args.trim();
  }

  if (!queryText && fallbackQuery) {
    queryText = fallbackQuery;
  }

  if (queryText && queryText.length > 55) {
    queryText = queryText.slice(0, 52) + "...";
  }

  if (name.includes("search")) {
    console.log(`\n  ${theme.tool("⚡")} ${theme.tool("Searching the web for:")} ${theme.whiteBold(`"${queryText || "information"}"`)}`);
  } else if (name.includes("code")) {
    const lang = args?.language || "script";
    console.log(`\n  ${theme.tool("⚡")} ${theme.tool("Executing")} ${theme.accentBold(lang)} ${theme.tool("code...")}`);
  } else if (name.includes("calc")) {
    console.log(`\n  ${theme.tool("⚡")} ${theme.tool("Calculating:")} ${theme.accentBold(queryText || "formula")}`);
  } else if (name.includes("workspace") || name.includes("file")) {
    console.log(`\n  ${theme.tool("⚡")} ${theme.tool("Reading file:")} ${theme.whiteBold(queryText || "source")}`);
  } else if (name.includes("git")) {
    console.log(`\n  ${theme.tool("⚡")} ${theme.tool("Inspecting git repository...")}`);
  } else if (name.includes("fetch") || name.includes("url")) {
    console.log(`\n  ${theme.tool("⚡")} ${theme.tool("Fetching URL:")} ${theme.tool.underline(queryText || "resource")}`);
  } else if (name.includes("system")) {
    console.log(`\n  ${theme.tool("⚡")} ${theme.tool("Checking system diagnostics...")}`);
  } else {
    console.log(`\n  ${theme.tool("⚡")} ${theme.tool("Running")} ${theme.toolBold(toolName)}...`);
  }
}

/**
 * Tool result log
 */
export function renderToolResult(toolName, result, success = true) {
  if (!success) {
    console.log(`  ${theme.error("✖")} ${theme.error(toolName + " failed:")} ${theme.toolDim(result?.error || "Error")}\n`);
    return;
  }

  let summary = "";
  if (result && typeof result === "object") {
    if (result.results && Array.isArray(result.results)) {
      summary = `Found ${result.results.length} sources`;
    } else if (result.output) {
      summary = String(result.output).trim().slice(0, 50);
    } else if (result.result !== undefined) {
      summary = `Computed: ${result.result}`;
    } else if (result.lines !== undefined) {
      summary = `Read ${result.lines} lines`;
    } else {
      summary = "Completed";
    }
  } else {
    summary = String(result || "Completed").slice(0, 50);
  }

  console.log(`  ${theme.success("✔")} ${theme.muted(summary)}\n`);
}

/**
 * File icon helper
 */
function getFileIcon(filePath) {
  const ext = filePath.split(".").pop().toLowerCase();
  const base = filePath.split("/").pop().toLowerCase();

  if (base === "package.json") return "📦";
  if (base.includes("env")) return "⚙️";
  if (base === "readme.md") return "📝";

  switch (ext) {
    case "js":
    case "mjs":
      return "🟨";
    case "jsx":
    case "tsx":
      return "⚛️";
    case "ts":
      return "🔷";
    case "html":
      return "🌐";
    case "css":
      return "🎨";
    case "json":
      return "📋";
    case "py":
      return "🐍";
    default:
      return "📄";
  }
}

/**
 * Clean Project Tree Visualizer
 */
export function renderFileTree(files, folderName) {
  console.log(`\n  ${theme.accent("📁")} ${theme.whiteBold(folderName)}/`);

  const filesByDir = {};
  files.forEach((file) => {
    const filePath = typeof file === "string" ? file : file.path;
    const parts = filePath.split(/[/\\]/);
    const dir = parts.length > 1 ? parts.slice(0, -1).join("/") : "";
    const fileName = parts[parts.length - 1];

    if (!filesByDir[dir]) filesByDir[dir] = [];
    filesByDir[dir].push({ name: fileName, fullPath: filePath });
  });

  const dirs = Object.keys(filesByDir).sort();

  dirs.forEach((dir) => {
    if (dir) {
      console.log(`  ${theme.border("├──")} ${theme.tool(dir)}/`);
      filesByDir[dir].forEach((file, idx) => {
        const isLast = idx === filesByDir[dir].length - 1;
        const branch = isLast ? "└──" : "├──";
        const icon = getFileIcon(file.fullPath);
        console.log(`  ${theme.border("│")}   ${theme.border(branch)} ${icon} ${theme.white(file.name)}`);
      });
    } else {
      filesByDir[dir].forEach((file, idx) => {
        const isLast = idx === filesByDir[dir].length - 1 && dirs.length === 1;
        const branch = isLast ? "└──" : "├──";
        const icon = getFileIcon(file.fullPath);
        console.log(`  ${theme.border(branch)} ${icon} ${theme.white(file.name)}`);
      });
    }
  });
  console.log("");
}

/**
 * Setup Commands block
 */
export function renderSetupCommands(commands) {
  if (!commands || commands.length === 0) return;

  console.log(theme.accentBold("  Run Commands:"));
  commands.forEach((cmd) => {
    console.log(`    ${theme.accent("$")} ${theme.whiteBold(cmd)}`);
  });
  console.log("");
}

/**
 * Clean Error output
 */
export function renderError(message, details = null) {
  console.log(`\n${theme.errorBold("✖ " + message)}`);
  if (details) {
    console.log(theme.muted(`  ${details}\n`));
  } else {
    console.log("");
  }
}

/**
 * Clean Warning output
 */
export function renderWarning(message) {
  console.log(theme.warning(`▲ ${message}`));
}

/**
 * Clean Exit output
 */
export function renderGoodbye(message = "Session ended.") {
  console.log(theme.muted(`\n✦ ${message}\n`));
}
