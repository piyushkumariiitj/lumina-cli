import { marked } from "marked";
import { markedTerminal } from "marked-terminal";
import chalk from "chalk";
import { theme } from "./theme.js";

/**
 * Converts markdown tables into clean, terminal-friendly key-value bullet lists
 * to avoid messy wrapping and broken ASCII borders in narrow/wide terminals.
 */
function convertTablesToLists(text) {
  if (!text || !text.includes("|")) return text;

  const tableRegex = /((?:^[ \t]*\|[^\n]+\|[ \t]*(?:\r?\n|$))+)/gm;

  return text.replace(tableRegex, (match) => {
    const lines = match
      .trim()
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length < 2) return match;

    const headers = lines[0]
      .split("|")
      .map((h) => h.trim())
      .filter(Boolean);

    if (!lines[1].includes("-")) return match;

    const dataRows = lines.slice(2);
    if (dataRows.length === 0) return match;

    const listItems = dataRows.map((row) => {
      const cells = row
        .split("|")
        .map((c) => c.trim())
        .filter(Boolean);

      if (cells.length === 0) return "";

      // 2 columns (e.g. Key | Value)
      if (cells.length === 2) {
        const key = cells[0].replace(/\*\*/g, "").trim();
        return `• **${key}**: ${cells[1]}`;
      }

      // 3 columns (e.g. Key | Value | Source/Note)
      if (cells.length === 3) {
        const key = cells[0].replace(/\*\*/g, "").trim();
        const note = cells[2] ? ` _(${cells[2]})_` : "";
        return `• **${key}**: ${cells[1]}${note}`;
      }

      // Multi-column general fallback
      const parts = cells
        .map((cell, idx) => {
          const header = headers[idx] || `Item ${idx + 1}`;
          return `**${header}**: ${cell}`;
        })
        .join(" • ");

      return `• ${parts}`;
    }).filter(Boolean);

    return `\n\n${listItems.join("\n")}\n\n`;
  });
}

// Clean, readable terminal markdown using palette tokens
marked.use(
  markedTerminal({
    // Heading styling using amber accent (#e8b339)
    heading: (text) => {
      const cleanText = text.replace(/^[#\s]+/, "");
      return `\n${theme.accentBold(cleanText)}\n`;
    },
    firstHeading: (text) => {
      const cleanText = text.replace(/^[#\s]+/, "");
      return `\n${theme.accentBold(cleanText)}\n`;
    },

    // Code blocks with syntax-clean indentation
    code: (code, lang) => {
      const header = lang ? theme.muted(`[${lang}]`) + "\n" : "";
      const indented = code
        .split("\n")
        .map((line) => `  ${theme.white(line)}`)
        .join("\n");
      return `\n${header}${indented}\n`;
    },

    // Inline codespan
    codespan: (text) => theme.accent(`\`${text}\``),

    // Blockquotes with agent violet (#af87ff) bar
    blockquote: (text) =>
      text
        .split("\n")
        .map((line) => `  ${theme.agent("│")} ${chalk.italic.hex("#b0b0b0")(line)}`)
        .join("\n") + "\n",

    // Lists
    listitem: (text) => `  ${theme.tool("•")} ${text}`,
    list: (body) => `${body}\n`,

    strong: theme.whiteBold,
    em: chalk.italic.hex("#d0d0d0"),
    del: theme.mutedDim,

    link: theme.tool.underline,
    href: theme.muted,

    hr: () => `\n${theme.border("─".repeat(40))}\n`,
    paragraph: (text) => `${text}\n\n`,
  })
);

export function renderMarkdown(mdText) {
  if (!mdText) return "";
  try {
    // 1. Convert HTML <br> tags into clean separators
    let processed = mdText.replace(/<br\s*\/?>/gi, ", ");

    // 2. Strip ugly raw search citation tokens like 【0†results.0.title】
    processed = processed.replace(/【\d+†[^】]+】/g, "");

    // 3. Convert markdown tables into terminal-clean definition lists
    processed = convertTablesToLists(processed);

    // 4. Fix duplicate bullets or formatting artifacts
    processed = processed.replace(/•\s*,/g, "•").replace(/,\s*•/g, " •");

    const rendered = marked.parse(processed);
    return typeof rendered === "string" ? rendered.trim() : String(rendered);
  } catch (err) {
    return mdText;
  }
}
