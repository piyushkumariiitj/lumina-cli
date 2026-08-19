import chalk from "chalk";

/**
 * Exact Lumina CLI Theme Specification
 * 
 * accent:   #e8b339 amber      (brand/header glyph — warm, draws the eye once)
 * user:     #5fd75f green      (your own input — calm, recedes once read)
 * agent:    #af87ff violet     (distinct from user green, reads as "other speaker")
 * tool:     #5fafd7 steel blue (cool, clearly not conversation text)
 * toolDim:  #6c6c6c grey       (tool output body — de-emphasized vs command line)
 * success:  #5fd787 mint green (tool succeeded / good exit code)
 * error:    #ff5f5f coral red  (failures, exceptions)
 * warning:  #ffaf5f orange     (rate limits, truncated output, retries)
 * muted:    #808080 grey       (footer, hints, timestamps — always last priority)
 * border:   #3a3a3a dark grey  (panel borders — visible but recedes)
 */
export const theme = {
  accent: chalk.hex("#e8b339"),
  accentBold: chalk.hex("#e8b339").bold,
  user: chalk.hex("#5fd75f"),
  userBold: chalk.hex("#5fd75f").bold,
  agent: chalk.hex("#af87ff"),
  agentBold: chalk.hex("#af87ff").bold,
  tool: chalk.hex("#5fafd7"),
  toolBold: chalk.hex("#5fafd7").bold,
  toolDim: chalk.hex("#6c6c6c"),
  success: chalk.hex("#5fd787"),
  successBold: chalk.hex("#5fd787").bold,
  error: chalk.hex("#ff5f5f"),
  errorBold: chalk.hex("#ff5f5f").bold,
  warning: chalk.hex("#ffaf5f"),
  warningBold: chalk.hex("#ffaf5f").bold,
  muted: chalk.hex("#808080"),
  mutedDim: chalk.hex("#808080").dim,
  border: chalk.hex("#3a3a3a"),
  white: chalk.hex("#f0f0f0"),
  whiteBold: chalk.hex("#f0f0f0").bold,
};

export const symbols = {
  glyph: "✦",
  prompt: "❯",
  bullet: "•",
  check: "✔",
  cross: "✖",
  tool: "⚡",
  agent: "🤖",
  info: "ℹ",
  warn: "▲",
  line: "─",
};

/**
 * Format tag, e.g. [tool] or [agent]
 */
export function tag(text, colorName = "tool") {
  const colorFn = theme[colorName] || theme.tool;
  return theme.muted("[") + colorFn(text) + theme.muted("]");
}
