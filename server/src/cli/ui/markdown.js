import { marked } from "marked";
import { markedTerminal } from "marked-terminal";
import chalk from "chalk";
import { theme } from "./theme.js";

// Clean, readable terminal markdown using palette tokens
marked.use(
  markedTerminal({
    // Heading styling using amber accent (#e8b339)
    heading: (text) => `\n${theme.accentBold("# " + text)}\n`,
    firstHeading: (text) => `\n${theme.accentBold("## " + text)}\n`,

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

    // Table formatting with border color (#3a3a3a)
    tableOptions: {
      chars: {
        top: "─",
        "top-mid": "┬",
        "top-left": "┌",
        "top-right": "┐",
        bottom: "─",
        "bottom-mid": "┴",
        "bottom-left": "└",
        "bottom-right": "┘",
        left: "│",
        "left-mid": "├",
        mid: "─",
        "mid-mid": "┼",
        right: "│",
        "right-mid": "┤",
        middle: "│",
      },
      style: {
        head: ["bold", "yellow"],
        border: ["grey"],
      },
    },
  })
);

export function renderMarkdown(mdText) {
  if (!mdText) return "";
  try {
    const rendered = marked.parse(mdText);
    return typeof rendered === "string" ? rendered.trim() : String(rendered);
  } catch (err) {
    return mdText;
  }
}
