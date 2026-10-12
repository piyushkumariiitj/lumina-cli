import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { makeTempDir } from "./helpers.js";
import { createTestAuth, startFakeUpstream, startLumina, writeSse } from "./server-helpers.js";

// Isolate this process from the developer's real credentials *before* the CLI modules load:
// a fake home for ~/.better-auth, and an empty GROQ_API_KEY so server/.env can't supply one.
const home = await makeTempDir("lumina-home-");
Object.assign(process.env, {
  HOME: home,
  USERPROFILE: home,
  GROQ_API_KEY: "",
  GROQ_KEY: "",
  LUMINA_MODEL: "openai/gpt-oss-120b",
  LUMINA_FALLBACK_MODEL: "openai/gpt-oss-20b",
});
const { AIService } = await import("../src/cli/ai/groq-service.js");
const { availableTools, enableTools, getEnabledTools, resetTools } = await import("../src/config/tool.config.js");

let authCtx;
let upstream;
let lumina;
const toolRejections = new Map();

async function writeToken(fields) {
  const dir = path.join(home, ".better-auth");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "token.json"), JSON.stringify({ token_type: "Bearer", ...fields }));
}
const validToken = () => writeToken({ access_token: authCtx.token, expires_at: new Date(Date.now() + 86_400_000).toISOString() });

function sseToolCall(res, name, args) {
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  const base = { id: "c1", object: "chat.completion.chunk", created: 1, model: "openai/gpt-oss-120b" };
  res.write(
    `data: ${JSON.stringify({
      ...base,
      choices: [{ index: 0, delta: { role: "assistant", tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: null }],
    })}\n\n`
  );
  res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] })}\n\n`);
  res.end("data: [DONE]\n\n");
}

before(async () => {
  authCtx = await createTestAuth();
  upstream = await startFakeUpstream(async (body, req, res) => {
    const last = body.messages.at(-1);
    const lastUser = [...body.messages].reverse().find((m) => m.role === "user")?.content ?? "";
    if (String(lastUser).includes("trigger-429") && body.model === "openai/gpt-oss-120b") {
      res.writeHead(429, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: { message: "Rate limit reached for model", type: "rate_limit", code: "rate_limit_exceeded" } }));
    }
    // Simulate Groq rejecting a malformed tool call (HTTP 400, code tool_use_failed).
    const rejectTimes = String(lastUser).match(/reject-tool-call-(\d)/)?.[1];
    if (rejectTimes && body.tools && last.role !== "tool") {
      toolRejections.set(lastUser, (toolRejections.get(lastUser) ?? 0) + 1);
      if (toolRejections.get(lastUser) <= Number(rejectTimes)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: { message: "Tool call validation failed: parameters did not match schema", type: "invalid_request_error", code: "tool_use_failed" } }));
      }
    }
    if (body.tools && last.role !== "tool") return sseToolCall(res, "calculator", { expression: "6 * 7" });
    if (last.role === "tool") return writeSse(res, [`The answer is ${JSON.parse(last.content).result}.`]);
    return writeSse(res, ["Hello ", "from ", body.model === "openai/gpt-oss-20b" ? "fallback" : "proxy"]);
  });
  lumina = await startLumina({ auth: authCtx.auth, upstreamUrl: upstream.url });
  process.env.LUMINA_SERVER_URL = lumina.url;
});

after(async () => {
  await lumina?.close();
  await upstream?.close();
});

test("a logged-in CLI talks to the model through the server proxy", async () => {
  await validToken();
  const ai = new AIService();
  assert.equal(await ai.ensureApiKey(), "proxy");
  assert.equal(ai.apiKey, "", "no provider key on the client");

  const before = upstream.requests.length;
  const chunks = [];
  const result = await ai.sendMessage([{ role: "user", content: "hi" }], (c) => chunks.push(c));
  assert.equal(result.content, "Hello from proxy");
  assert.equal(chunks.join(""), "Hello from proxy");

  const forwarded = upstream.requests[before];
  assert.equal(forwarded.headers.authorization, "Bearer gsk_server_side_key", "server adds its own key upstream");
  assert.equal(process.env.GROQ_API_KEY, "", "the CLI must not export keys into its environment");
});

test("tools mode runs a real multi-step tool loop with non-empty schemas", async () => {
  await validToken();
  const ai = new AIService();
  enableTools(["calculator"]);
  try {
    const before = upstream.requests.length;
    const calls = [];
    const results = [];
    const result = await ai.sendMessage(
      [{ role: "user", content: "what is 6 times 7?" }],
      () => {},
      getEnabledTools(),
      (c) => calls.push(c),
      (r) => results.push(r)
    );
    assert.deepEqual(calls.map((c) => [c.toolName, c.input]), [["calculator", { expression: "6 * 7" }]]);
    assert.equal(results[0].output.result, "42");
    assert.equal(result.content, "The answer is 42.");

    const [first, second] = upstream.requests.slice(before);
    assert.deepEqual(Object.keys(first.body.tools[0].function.parameters.properties), ["expression"]);
    assert.equal(second.body.messages.at(-1).role, "tool", "tool result was sent back to the model");
  } finally {
    resetTools();
  }
});

test("a tool call rejected by the provider is retried once, then reported clearly", async () => {
  await validToken();
  enableTools(["calculator"]);
  try {
    const ai = new AIService();
    const ok = await ai.sendMessage([{ role: "user", content: "reject-tool-call-1: what is 6 times 7?" }], () => {}, getEnabledTools());
    assert.equal(ok.content, "The answer is 42.");

    await assert.rejects(
      ai.sendMessage([{ role: "user", content: "reject-tool-call-2: what is 6 times 7?" }], () => {}, getEnabledTools()),
      /invalid tool call twice/
    );
  } finally {
    resetTools();
  }
});

test("provider rate limits fall back to the secondary model", async () => {
  await validToken();
  const ai = new AIService();
  const result = await ai.sendMessage([{ role: "user", content: "trigger-429 please" }], () => {});
  assert.equal(result.content, "Hello from fallback");
});

test("a revoked session produces a clear re-login message", async () => {
  await validToken();
  const ai = new AIService();
  await ai.ensureApiKey();
  const ctx = await authCtx.auth.$context;
  await ctx.internalAdapter.deleteSession(authCtx.token);
  try {
    await assert.rejects(ai.sendMessage([{ role: "user", content: "hi" }], () => {}), /lumina login/);
  } finally {
    const session = await ctx.internalAdapter.createSession((await ctx.internalAdapter.findUserByEmail("dev@example.com")).user.id);
    authCtx.token = session.token;
  }
});

test("an expired session is not used, and non-interactive runs fail clearly", async () => {
  await writeToken({ access_token: authCtx.token, expires_at: new Date(Date.now() - 1000).toISOString() });
  const ai = new AIService();
  await assert.rejects(ai.ensureApiKey(), /lumina login.*GROQ_API_KEY/);
});

test("all Tools-mode tools declare real input schemas", async () => {
  for (const t of availableTools) {
    const schema = t.getTool().inputSchema;
    assert.ok(schema && typeof schema.safeParse === "function", `${t.id} has a zod inputSchema`);
  }
});
