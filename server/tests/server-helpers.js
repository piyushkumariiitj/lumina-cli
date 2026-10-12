import http from "node:http";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { bearer, deviceAuthorization } from "better-auth/plugins";
import { createApp } from "../src/app.js";
import { loadServerConfig } from "../src/server/config.js";

/** A real Better Auth instance (same plugins as production) backed by memory. */
export async function createTestAuth({ deviceInterval = "5s" } = {}) {
  const db = { user: [], session: [], account: [], verification: [], deviceCode: [] };
  const auth = betterAuth({
    secret: "test-secret-".padEnd(40, "x"),
    baseURL: "http://localhost:3005",
    basePath: "/api/auth",
    database: memoryAdapter(db),
    logger: { disabled: true },
    plugins: [deviceAuthorization({ interval: deviceInterval }), bearer()],
  });
  const ctx = await auth.$context;
  const user = await ctx.internalAdapter.createUser({ name: "Test Dev", email: "dev@example.com", emailVerified: true });
  const session = await ctx.internalAdapter.createSession(user.id);
  return { auth, user, token: session.token };
}

export function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${server.address().port}`));
  });
}

/**
 * Fake OpenAI-compatible provider. `respond(body, req, res)` decides the response;
 * every request is recorded with its headers and parsed body.
 */
export async function startFakeUpstream(respond) {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : null;
    requests.push({ url: req.url, headers: req.headers, body });
    await respond(body, req, res);
  });
  const url = await listen(server);
  return { url, requests, close: () => new Promise((r) => server.close(r)) };
}

export function chatCompletionJson({ content = "", toolCalls, model = "openai/gpt-oss-120b" } = {}) {
  return {
    id: "chatcmpl-test",
    object: "chat.completion",
    created: 1,
    model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content,
          ...(toolCalls ? { tool_calls: toolCalls } : {}),
        },
        finish_reason: toolCalls ? "tool_calls" : "stop",
      },
    ],
    usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 },
  };
}

export function writeSse(res, pieces, model = "openai/gpt-oss-120b") {
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  pieces.forEach((text, i) => {
    const chunk = {
      id: "chatcmpl-test",
      object: "chat.completion.chunk",
      created: 1,
      model,
      choices: [{ index: 0, delta: i === 0 ? { role: "assistant", content: text } : { content: text }, finish_reason: null }],
    };
    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
  });
  res.write(
    `data: ${JSON.stringify({
      id: "chatcmpl-test",
      object: "chat.completion.chunk",
      created: 1,
      model,
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      x_groq: { usage: { prompt_tokens: 5, completion_tokens: pieces.length, total_tokens: 5 + pieces.length } },
    })}\n\n`
  );
  res.end("data: [DONE]\n\n");
}

/** Starts the Lumina app on an ephemeral port. */
export async function startLumina({ auth, env = {}, upstreamUrl }) {
  const config = loadServerConfig({
    BETTER_AUTH_SECRET: "unused-here",
    GROQ_API_KEY: "gsk_server_side_key",
    GROQ_BASE_URL: upstreamUrl || "http://127.0.0.1:9",
    CLIENT_URL: "https://app.example.com",
    ...env,
  });
  const silent = { info() {}, error() {} };
  const server = http.createServer(createApp({ auth, config, log: silent }));
  const url = await listen(server);
  return { url, config, close: () => new Promise((r) => server.close(r)) };
}
