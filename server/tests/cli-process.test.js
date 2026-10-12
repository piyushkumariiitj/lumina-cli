import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { promises as fs, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makeTempDir } from "./helpers.js";
import { createTestAuth, startLumina } from "./server-helpers.js";

// Runs the real `lumina` binary against a real (in-memory) server, typing into its prompts.
const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/cli/main.js");
const strip = (s) => s.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "");

let authCtx;
let lumina;
before(async () => {
  authCtx = await createTestAuth({ deviceInterval: "1s" });
  lumina = await startLumina({ auth: authCtx.auth });
});
after(() => lumina?.close());

async function freshHome() {
  const home = await makeTempDir("lumina-cli-home-");
  return { home, tokenFile: path.join(home, ".better-auth", "token.json") };
}

function runCli(args, home) {
  const proc = spawn(process.execPath, [CLI, ...args], {
    env: {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      DATABASE_URL: "", // never let the CLI's direct-DB code reach a real database
      DIRECT_URL: "",
      GROQ_API_KEY: " ",
      BETTER_AUTH_URL: "",
      LUMINA_SERVER_URL: lumina.url,
    },
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  let out = "";
  const waiters = [];
  const onData = (d) => {
    out += strip(d.toString());
    for (const w of [...waiters]) if (out.includes(w.text)) waiters.splice(waiters.indexOf(w), 1) && w.resolve();
  };
  proc.stdout.on("data", onData);
  proc.stderr.on("data", onData);
  const exited = new Promise((resolve) => proc.on("close", resolve));
  return {
    output: () => out,
    waitFor: (text) => (out.includes(text) ? Promise.resolve() : new Promise((resolve) => waiters.push({ text, resolve }))),
    async press(...keys) {
      for (const k of keys) {
        await new Promise((r) => setTimeout(r, 100));
        proc.stdin.write(k);
      }
    },
    // Resolves with the exit code; fails if the process doesn't exit by itself in time.
    // stdin is deliberately left open, as a script or CI runner would.
    async exitWithin(ms) {
      const timer = new Promise((resolve) => setTimeout(() => resolve("timeout"), ms));
      const code = await Promise.race([exited, timer]);
      if (code === "timeout") proc.kill();
      return code;
    },
  };
}

async function approveDeviceCode(userCode) {
  const headers = { Authorization: `Bearer ${authCtx.token}`, "Content-Type": "application/json" };
  const claim = await fetch(`${lumina.url}/api/auth/device?user_code=${encodeURIComponent(userCode)}`, { headers });
  assert.equal(claim.status, 200);
  const approve = await fetch(`${lumina.url}/api/auth/device/approve`, { method: "POST", headers, body: JSON.stringify({ userCode }) });
  assert.equal(approve.status, 200);
}

test("lumina login: device flow stores the real user and exits on its own", async () => {
  const { home, tokenFile } = await freshHome();
  const cli = runCli(["login", "--server-url", lumina.url], home);
  await cli.waitFor("Open browser automatically?");
  const code = cli.output().match(/Code:\s+([A-Z0-9-]{8,9})/)?.[1];
  assert.ok(code, "user code printed");
  await cli.press("n", "\r");
  await approveDeviceCode(code);

  assert.equal(await cli.exitWithin(20_000), 0, cli.output().slice(-500));
  assert.match(cli.output(), /Login successful/);
  const token = JSON.parse(await fs.readFile(tokenFile, "utf8"));
  // Before the server had the bearer() plugin, this was the placeholder "Developer".
  assert.equal(token.user.name, "Test Dev");
});

test("lumina whoami: fetches the profile from the server with the stored token", async () => {
  const { home, tokenFile } = await freshHome();
  await fs.mkdir(path.dirname(tokenFile), { recursive: true });
  await fs.writeFile(tokenFile, JSON.stringify({ access_token: authCtx.token, expires_at: new Date(Date.now() + 3_600_000).toISOString() }));
  const cli = runCli(["whoami"], home);
  assert.equal(await cli.exitWithin(15_000), 0);
  assert.match(cli.output(), /Test Dev/);
});

test("lumina logout: ends the server session, removes the token, exits by itself", async () => {
  const { home, tokenFile } = await freshHome();
  const ctx = await authCtx.auth.$context;
  const user = (await ctx.internalAdapter.findUserByEmail("dev@example.com")).user;
  const { token } = await ctx.internalAdapter.createSession(user.id);
  const me = () => fetch(`${lumina.url}/api/me`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.status);
  assert.equal(await me(), 200);

  await fs.mkdir(path.dirname(tokenFile), { recursive: true });
  await fs.writeFile(tokenFile, JSON.stringify({ access_token: token, user: { name: "Test Dev" } }));
  const cli = runCli(["logout"], home);
  await cli.waitFor("logout?");
  await cli.press("y", "\r");
  assert.equal(await cli.exitWithin(10_000), 0, "process should exit by itself after the prompt");
  assert.equal(existsSync(tokenFile), false);
  assert.equal(await me(), 401, "the session must be revoked on the server");
});

test("lumina login: Ctrl+C at the browser prompt cancels instead of waiting", async () => {
  const { home, tokenFile } = await freshHome();
  const cli = runCli(["login", "--server-url", lumina.url], home);
  await cli.waitFor("Open browser automatically?");
  await cli.press("\x03");
  assert.equal(await cli.exitWithin(10_000), 0);
  assert.match(cli.output(), /Login cancelled/);
  assert.equal(existsSync(tokenFile), false);
});
