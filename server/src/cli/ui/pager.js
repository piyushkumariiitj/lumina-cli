import readline from "node:readline";
import { theme } from "./theme.js";

const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");

/**
 * Prints text so that a long answer can be read from its first line: when it is taller
 * than the terminal, it is shown one screen at a time (Space/Enter: next page, q: rest).
 * Terminals always scroll to the newest output, so printing everything at once would
 * leave the user looking at the end of the answer.
 */
export async function printPaged(text, { input = process.stdin, output = process.stdout } = {}) {
  const lines = text.split("\n");
  const rows = output.rows;
  if (!output.isTTY || !input.isTTY || !rows || typeof input.setRawMode !== "function") {
    output.write(text + "\n");
    return;
  }

  const columns = output.columns || 80;
  const height = (line) => Math.max(1, Math.ceil(stripAnsi(line).length / columns));
  const pageHeight = Math.max(3, rows - 2); // keep room for the "more" prompt
  let next = 0;

  const writePage = () => {
    let used = 0;
    while (next < lines.length && (used === 0 || used + height(lines[next]) <= pageHeight)) {
      used += height(lines[next]);
      output.write(lines[next++] + "\n");
    }
  };
  const writeRest = () => {
    while (next < lines.length) output.write(lines[next++] + "\n");
  };

  writePage();
  if (next >= lines.length) return;

  readline.emitKeypressEvents(input);
  const wasRaw = Boolean(input.isRaw);
  input.setRawMode(true);
  input.resume();

  await new Promise((resolve) => {
    const showPrompt = () =>
      output.write(
        theme.muted(`── ${Math.round((next / lines.length) * 100)}% · Space/Enter: next page · q: show the rest ──`)
      );
    const clearPrompt = () => output.write("\r\x1b[2K");

    const finish = () => {
      input.off("keypress", onKey);
      input.setRawMode(wasRaw);
      input.pause();
      resolve();
    };

    function onKey(str, key = {}) {
      clearPrompt();
      if (key.ctrl && key.name === "c") {
        finish();
        process.kill(process.pid, "SIGINT");
        return;
      }
      if (key.name === "q" || key.name === "escape") writeRest();
      else if (key.name === "space" || key.name === "return" || key.name === "enter" || key.name === "pagedown" || key.name === "down") writePage();
      else {
        showPrompt();
        return;
      }
      if (next >= lines.length) finish();
      else showPrompt();
    }

    input.on("keypress", onKey);
    showPrompt();
  });
}
