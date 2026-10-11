import { Readable } from "node:stream";
import { createRateLimiter } from "./rate-limit.js";

// Headers from the provider that are useful to the CLI (retry hints, request ids).
const FORWARDED_RESPONSE_HEADERS = ["content-type", "retry-after", "x-request-id"];

// Fields a client may send; anything else is dropped before forwarding.
const ALLOWED_FIELDS = new Set([
  "model", "messages", "tools", "tool_choice", "parallel_tool_calls", "temperature", "top_p",
  "max_tokens", "max_completion_tokens", "stop", "stream", "stream_options", "seed",
  "response_format", "reasoning_effort", "reasoning_format", "include_reasoning",
  "frequency_penalty", "presence_penalty",
]);

export function openAiError(res, status, message, code = "lumina_proxy_error") {
  return res.status(status).json({ error: { message, type: "invalid_request_error", code } });
}

/**
 * Validates a chat-completions body and returns a sanitized copy, or { error }.
 */
export function sanitizeChatRequest(body, { allowedModels, maxOutputTokens }) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "Request body must be a JSON object." };
  if (!allowedModels.includes(body.model)) {
    return { error: `Model '${body.model}' is not available through Lumina. Allowed: ${allowedModels.join(", ")}.` };
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) return { error: "messages must be a non-empty array." };

  const clean = {};
  for (const [key, value] of Object.entries(body)) {
    if (ALLOWED_FIELDS.has(key)) clean[key] = value;
  }
  const requested = Number(clean.max_completion_tokens ?? clean.max_tokens) || maxOutputTokens;
  delete clean.max_tokens;
  clean.max_completion_tokens = Math.min(requested, maxOutputTokens);
  return { body: clean };
}

/**
 * POST handler for /api/ai/proxy/v1/chat/completions. Authenticates the Lumina
 * session, applies per-user limits, then forwards to the provider with the
 * server's key, streaming the response back unchanged. The key never leaves
 * the server.
 */
export function createChatCompletionsProxy({ config, getUserId, fetchImpl = fetch, log = console }) {
  const { proxy } = config;
  const limiter = createRateLimiter({ requestsPerMinute: proxy.requestsPerMinute, maxConcurrent: proxy.maxConcurrent });

  return async function chatCompletionsProxy(req, res) {
    const userId = await getUserId(req);
    if (!userId) return openAiError(res, 401, "Not signed in or session expired. Run 'lumina login'.", "invalid_api_key");
    if (!config.groqApiKey) return openAiError(res, 503, "The Lumina server has no model provider key configured.");

    const sanitized = sanitizeChatRequest(req.body, proxy);
    if (sanitized.error) return openAiError(res, 400, sanitized.error);

    const slot = limiter.acquire(userId);
    if (!slot.ok) {
      res.set("Retry-After", String(slot.retryAfterSeconds));
      return openAiError(res, 429, `Lumina rate limit: ${slot.reason}. Try again shortly.`, "rate_limit_exceeded");
    }

    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error("upstream timeout")), proxy.timeoutMs);
    // Stop the upstream request if the CLI disconnects.
    res.on("close", () => {
      if (!res.writableFinished) controller.abort(new Error("client disconnected"));
    });

    let status = 0;
    try {
      const upstream = await fetchImpl(`${config.groqBaseUrl}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.groqApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(sanitized.body),
        signal: controller.signal,
      });
      status = upstream.status;
      res.status(upstream.status);
      for (const name of FORWARDED_RESPONSE_HEADERS) {
        const value = upstream.headers.get(name);
        if (value) res.set(name, value);
      }
      if (!upstream.body) return res.end();
      await new Promise((resolve, reject) => {
        const stream = Readable.fromWeb(upstream.body);
        stream.on("error", reject);
        res.on("finish", resolve);
        res.on("close", resolve);
        stream.pipe(res);
      });
    } catch (err) {
      if (!res.headersSent) {
        const timedOut = controller.signal.aborted && String(controller.signal.reason?.message).includes("timeout");
        openAiError(res, timedOut ? 504 : 502, timedOut ? "The model provider timed out." : "Could not reach the model provider.");
        status = timedOut ? 504 : 502;
      } else {
        res.destroy(err);
      }
    } finally {
      clearTimeout(timer);
      slot.release();
      log.info?.(
        `[ai-proxy] user=${userId} model=${sanitized.body.model} stream=${Boolean(sanitized.body.stream)} status=${status} ms=${Date.now() - started}`
      );
    }
  };
}
