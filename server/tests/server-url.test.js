import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { resolveServerUrl } from "../src/lib/server-url.js";
import { listen } from "./server-helpers.js";

const VARS = ["LUMINA_SERVER_URL", "BETTER_AUTH_URL", "LUMINA_PROD_URL"];
const saved = Object.fromEntries(VARS.map((k) => [k, process.env[k]]));
let healthyUrl;
let server;

before(async () => {
  server = http.createServer((req, res) => res.end(req.url === "/health" ? "OK" : ""));
  healthyUrl = await listen(server);
});
after(() => new Promise((r) => server.close(r)));
afterEach(() => {
  for (const k of VARS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const DEAD = "http://127.0.0.1:9"; // nothing listens here

function setEnv(values) {
  for (const k of VARS) delete process.env[k];
  Object.assign(process.env, values);
}

test("--server-url and LUMINA_SERVER_URL are explicit choices, used without probing", async () => {
  setEnv({ LUMINA_SERVER_URL: `${DEAD}/` });
  assert.equal(await resolveServerUrl(), DEAD);
  assert.equal(await resolveServerUrl("https://custom.example/"), "https://custom.example");
});

test("BETTER_AUTH_URL from a dev .env is used only when that server is running", async () => {
  setEnv({ BETTER_AUTH_URL: healthyUrl, LUMINA_PROD_URL: "https://prod.example" });
  assert.equal(await resolveServerUrl(), healthyUrl);

  // The reported bug: a dev .env pointing at a stopped local server sent login there.
  setEnv({ BETTER_AUTH_URL: DEAD, LUMINA_PROD_URL: "https://prod.example" });
  const expected = (await localDevServerRunning()) ? "http://localhost:3005" : "https://prod.example";
  assert.equal(await resolveServerUrl(), expected);
});

// A contributor may have the real dev server running on the default port while tests run.
async function localDevServerRunning() {
  try {
    return (await fetch("http://localhost:3005/health", { signal: AbortSignal.timeout(500) })).ok;
  } catch {
    return false;
  }
}

test("defaults to the production server", async () => {
  setEnv({});
  const url = await resolveServerUrl();
  // Unless a dev server happens to run on localhost:3005, this is production.
  assert.ok(url === "https://lumina-cli.onrender.com" || url === "http://localhost:3005", url);
});
