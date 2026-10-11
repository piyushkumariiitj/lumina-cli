import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createTestAuth, startFakeUpstream, startLumina, chatCompletionJson, writeSse } from "./server-helpers.js";
import { sanitizeChatRequest } from "../src/server/ai-proxy.js";
import { createRateLimiter } from "../src/server/rate-limit.js";

let authCtx;
let upstream;
let lumina;
const bearer = () => ({ Authorization: `Bearer ${authCtx.token}` });

before(async () => {
  authCtx = await createTestAuth();
  upstream = await startFakeUpstream(async (body, req, res) => {
    if (body?.messages?.[0]?.content === "upstream-500") {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: { message: "provider exploded" } }));
    }
    if (body?.stream) return writeSse(res, ["Hel", "lo"]);
    res.writeHead(200, { "Content-Type": "application/json", "x-request-id": "req_123" });
    res.end(JSON.stringify(chatCompletionJson({ content: "hi there" })));
  });
  lumina = await startLumina({ auth: authCtx.auth, upstreamUrl: upstream.url });
});

after(async () => {
  await lumina?.close();
  await upstream?.close();
});

const post = (path, body, headers = {}) =>
  fetch(`${lumina.url}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const chat = (extra = {}) => ({ model: "openai/gpt-oss-120b", messages: [{ role: "user", content: "hello" }], ...extra });

test("health check responds", async () => {
  const res = await fetch(`${lumina.url}/health`);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "OK");
  assert.equal(res.headers.get("x-powered-by"), null);
});

test("CORS only echoes allow-listed origins", async () => {
  const evil = await fetch(`${lumina.url}/health`, { headers: { Origin: "https://evil.example" } });
  assert.equal(evil.headers.get("access-control-allow-origin"), null);

  const good = await fetch(`${lumina.url}/health`, { headers: { Origin: "https://app.example.com" } });
  assert.equal(good.headers.get("access-control-allow-origin"), "https://app.example.com");
  assert.equal(good.headers.get("access-control-allow-credentials"), "true");
});

test("/api/me resolves the CLI bearer token and never returns the session token", async () => {
  const anon = await fetch(`${lumina.url}/api/me`);
  assert.equal(anon.status, 401);

  const res = await fetch(`${lumina.url}/api/me`, { headers: bearer() });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.user.email, "dev@example.com");
  assert.ok(!JSON.stringify(body).includes(authCtx.token), "session token must not be echoed");
});

test("cookies alone do not authenticate CLI routes", async () => {
  const res = await fetch(`${lumina.url}/api/ai/config`, {
    headers: { Cookie: `better-auth.session_token=${authCtx.token}` },
  });
  assert.equal(res.status, 401);
});

test("/api/ai/config advertises the proxy and does not hand out the key", async () => {
  const res = await fetch(`${lumina.url}/api/ai/config`, { headers: bearer() });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body, {
    model: "openai/gpt-oss-120b",
    fallbackModel: "openai/gpt-oss-20b",
    proxy: { path: "/api/ai/proxy/v1" },
  });
});

test("legacy key handout only when explicitly enabled", async () => {
  const legacy = await startLumina({ auth: authCtx.auth, upstreamUrl: upstream.url, env: { LUMINA_LEGACY_KEY_HANDOUT: "true" } });
  try {
    const body = await (await fetch(`${legacy.url}/api/ai/config`, { headers: bearer() })).json();
    assert.equal(body.apiKey, "gsk_server_side_key");
  } finally {
    await legacy.close();
  }
});

test("proxy rejects anonymous requests and disallowed models", async () => {
  const anon = await post("/api/ai/proxy/v1/chat/completions", chat());
  assert.equal(anon.status, 401);
  assert.equal((await anon.json()).error.code, "invalid_api_key");

  const wrongModel = await post("/api/ai/proxy/v1/chat/completions", chat({ model: "some/expensive-model" }), bearer());
  assert.equal(wrongModel.status, 400);

  const badJson = await post("/api/ai/proxy/v1/chat/completions", "{nope", bearer());
  assert.equal(badJson.status, 400);
});

test("proxy forwards with the server key, caps output tokens and drops unknown fields", async () => {
  const before = upstream.requests.length;
  const res = await post("/api/ai/proxy/v1/chat/completions", chat({ max_tokens: 999999, user: "spoof", n: 5 }), bearer());
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("x-request-id"), "req_123");
  assert.equal((await res.json()).choices[0].message.content, "hi there");

  const forwarded = upstream.requests[before];
  assert.equal(forwarded.url, "/chat/completions");
  assert.equal(forwarded.headers.authorization, "Bearer gsk_server_side_key");
  assert.equal(forwarded.body.max_completion_tokens, 16384);
  assert.equal(forwarded.body.max_tokens, undefined);
  assert.equal(forwarded.body.n, undefined);
  assert.equal(forwarded.body.user, undefined);
});

test("proxy streams server-sent events through", async () => {
  const res = await post("/api/ai/proxy/v1/chat/completions", chat({ stream: true }), bearer());
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /text\/event-stream/);
  const text = await res.text();
  assert.match(text, /"content":"Hel"/);
  assert.match(text, /\[DONE\]/);
});

test("proxy passes provider errors through and reports unreachable providers", async () => {
  const res = await post("/api/ai/proxy/v1/chat/completions", chat({ messages: [{ role: "user", content: "upstream-500" }] }), bearer());
  assert.equal(res.status, 500);
  assert.equal((await res.json()).error.message, "provider exploded");

  const down = await startLumina({ auth: authCtx.auth, upstreamUrl: "http://127.0.0.1:9" });
  try {
    const downRes = await fetch(`${down.url}/api/ai/proxy/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...bearer() },
      body: JSON.stringify(chat()),
    });
    assert.equal(downRes.status, 502);
  } finally {
    await down.close();
  }
});

test("proxy answers 503 when the server has no provider key", async () => {
  const nokey = await startLumina({ auth: authCtx.auth, upstreamUrl: upstream.url, env: { GROQ_API_KEY: "" } });
  try {
    const res = await fetch(`${nokey.url}/api/ai/proxy/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...bearer() },
      body: JSON.stringify(chat()),
    });
    assert.equal(res.status, 503);
  } finally {
    await nokey.close();
  }
});

test("proxy enforces the per-user request rate", async () => {
  const limited = await startLumina({ auth: authCtx.auth, upstreamUrl: upstream.url, env: { LUMINA_PROXY_RPM: "2" } });
  try {
    const send = () =>
      fetch(`${limited.url}/api/ai/proxy/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...bearer() },
        body: JSON.stringify(chat()),
      });
    assert.equal((await send()).status, 200);
    assert.equal((await send()).status, 200);
    const third = await send();
    assert.equal(third.status, 429);
    assert.ok(Number(third.headers.get("retry-after")) >= 1);
  } finally {
    await limited.close();
  }
});

test("/device encodes the user code in the redirect", async () => {
  const res = await fetch(`${lumina.url}/device?user_code=AB%26next%3Dhttps://evil`, { redirect: "manual" });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), "https://app.example.com/device?user_code=AB%26next%3Dhttps%3A%2F%2Fevil");
});

test("sanitizeChatRequest validates shape", () => {
  const opts = { allowedModels: ["m"], maxOutputTokens: 100 };
  assert.ok(sanitizeChatRequest(null, opts).error);
  assert.ok(sanitizeChatRequest({ model: "m", messages: [] }, opts).error);
  assert.deepEqual(sanitizeChatRequest({ model: "m", messages: [{}], max_completion_tokens: 50 }, opts).body, {
    model: "m",
    messages: [{}],
    max_completion_tokens: 50,
  });
});

test("rate limiter caps concurrency and releases slots", () => {
  let t = 0;
  const limiter = createRateLimiter({ requestsPerMinute: 10, maxConcurrent: 1, now: () => t });
  const first = limiter.acquire("u");
  assert.equal(first.ok, true);
  assert.equal(limiter.acquire("u").ok, false);
  assert.equal(limiter.acquire("other").ok, true);
  first.release();
  first.release(); // idempotent
  const second = limiter.acquire("u");
  assert.equal(second.ok, true);
  second.release();

  // Ten requests inside one minute exhaust the window; it reopens after 60s.
  const fresh = createRateLimiter({ requestsPerMinute: 2, maxConcurrent: 5, now: () => t });
  fresh.acquire("x").release();
  fresh.acquire("x").release();
  assert.equal(fresh.acquire("x").ok, false);
  t += 60_001;
  assert.equal(fresh.acquire("x").ok, true);
});
