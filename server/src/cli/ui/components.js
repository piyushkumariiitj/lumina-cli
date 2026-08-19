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
 * Tool execution label
 * Uses tool (#5fafd7) for name and toolDim (#6c6c6c) for args
 */
export function renderToolExecution(toolName, args = {}) {
  let queryText = "";
  if (typeof args === "object" && args !== null) {
    queryText = args.query || args.expression || args.filePath || args.code || args.url || JSON.stringify(args);
  } else {
    queryText = String(args || "");
  }

  if (queryText.length > 60) {
    queryText = queryText.slice(0, 57) + "...";
  }

  console.log(`  ${theme.tool("⚡")} ${theme.toolBold(toolName)}${queryText ? theme.toolDim(`: "${queryText}"`) : ""}`);
}

/**
 * Tool result log
 * Uses success (#5fd787) or error (#ff5f5f) with toolDim (#6c6c6c) for output body
 */
export function renderToolResult(toolName, result, success = true) {
  if (!success) {
    console.log(`  ${theme.error("✖")} ${theme.error(toolName + " failed:")} ${theme.toolDim(result?.error || "Error")}`);
    return;
  }

  let summary = "";
  if (result && typeof result === "object") {
    if (result.results && Array.isArray(result.results)) {
      summary = `Found ${result.results.length} results`;
    } else if (result.output) {
      summary = String(result.output).trim().slice(0, 60);
    } else if (result.result !== undefined) {
      summary = `Result: ${result.result}`;
    } else {
      summary = "Done";
    }
  } else {
    summary = String(result || "Done").slice(0, 60);
  }

  console.log(`  ${theme.success("✔")} ${theme.toolDim(summary)}`);
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
