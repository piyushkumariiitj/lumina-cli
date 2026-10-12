import { test } from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { printPaged } from "../src/cli/ui/pager.js";

const strip = (s) => s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "").replace(/\r/g, "");

function fakeTerminal(rows, columns = 80) {
  const input = new PassThrough();
  Object.assign(input, { isTTY: true, isRaw: false, setRawMode(v) { this.isRaw = v; return this; } });
  const output = new PassThrough();
  Object.assign(output, { isTTY: true, rows, columns });
  let screen = "";
  output.on("data", (d) => (screen += d));
  return { input, output, screen: () => strip(screen) };
}

const lines = (n) => Array.from({ length: n }, (_, i) => `line ${i + 1}`).join("\n");
const tick = () => new Promise((r) => setTimeout(r, 20));

test("short answers print at once", async () => {
  const t = fakeTerminal(24);
  await printPaged(lines(5), t);
  assert.match(t.screen(), /line 5/);
  assert.doesNotMatch(t.screen(), /next page/);
});

test("long answers start at the top and page on Space", async () => {
  const t = fakeTerminal(10); // 8 lines per page
  const done = printPaged(lines(20), t);
  await tick();
  assert.match(t.screen(), /line 1\n[\s\S]*line 8\n/);
  assert.doesNotMatch(t.screen(), /line 9\n/, "nothing past the first screen yet");
  assert.match(t.screen(), /next page/);

  t.input.write(" ");
  await tick();
  assert.match(t.screen(), /line 16\n/);
  assert.doesNotMatch(t.screen(), /line 17\n/);

  t.input.write("q"); // show the rest
  await done;
  assert.match(t.screen(), /line 20\n/);
  assert.equal(t.input.isRaw, false, "terminal mode restored for the next prompt");
});

test("not a terminal: prints everything", async () => {
  const output = new PassThrough();
  let out = "";
  output.on("data", (d) => (out += d));
  await printPaged(lines(100), { input: new PassThrough(), output });
  assert.match(out, /line 100/);
});
