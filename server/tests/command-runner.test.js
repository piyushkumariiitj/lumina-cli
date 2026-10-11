import { test } from "node:test";
import assert from "node:assert/strict";
import { runCommand, buildCommandEnv, OutputBuffer } from "../src/agent/command-runner.js";

test("captures exit codes and output", async () => {
  const ok = await runCommand('node -e "console.log(42)"');
  assert.equal(ok.exitCode, 0);
  assert.match(ok.output, /42/);

  const fail = await runCommand('node -e "console.error(\'boom\'); process.exit(3)"');
  assert.equal(fail.exitCode, 3);
  assert.equal(fail.timedOut, false);
  assert.match(fail.output, /boom/);
});

test("kills commands that exceed the timeout", async () => {
  const started = Date.now();
  const res = await runCommand('node -e "setTimeout(() => {}, 30000)"', { timeoutMs: 500 });
  assert.equal(res.timedOut, true);
  assert.equal(res.exitCode, null);
  assert.ok(Date.now() - started < 10_000, "should not wait for the command to finish");
});

test("does not pass Lumina credentials to commands", async () => {
  const env = buildCommandEnv({ ...process.env, GROQ_API_KEY: "gsk_secret", LUMINA_MODEL: "x", KEEP_ME: "yes" });
  assert.equal(env.GROQ_API_KEY, undefined);
  assert.equal(env.LUMINA_MODEL, undefined);
  assert.equal(env.KEEP_ME, "yes");

  const res = await runCommand('node -e "console.log(process.env.GROQ_API_KEY || \'unset\', process.env.KEEP_ME)"', { env });
  assert.match(res.output, /unset yes/);
});

test("OutputBuffer keeps head and tail of long output", () => {
  const buf = new OutputBuffer(10, 10);
  buf.push("0123456789");
  buf.push("abcdefghij");
  assert.equal(buf.truncated, false);
  assert.equal(buf.toString(), "0123456789abcdefghij");
  buf.push("KLMNOPQRST");
  assert.equal(buf.truncated, true);
  assert.equal(buf.toString(), "0123456789\n… [10 characters omitted] …\nKLMNOPQRST");
});
