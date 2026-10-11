import { generateText, tool } from "ai";

/**
 * The agent loop speaks a small provider-neutral message format:
 *   { role: "user", content }
 *   { role: "assistant", text, toolCalls: [{ id, name, input }] }
 *   { role: "tool", results: [{ id, name, output }] }
 * This module maps it to AI SDK v7 ModelMessages. A server-side proxy client can
 * implement the same generate() contract later without touching the loop.
 */
export function toModelMessages(messages) {
  return messages.map((m) => {
    if (m.role === "user") return { role: "user", content: m.content };
    if (m.role === "assistant") {
      const content = [];
      if (m.text) content.push({ type: "text", text: m.text });
      for (const call of m.toolCalls ?? []) {
        content.push({
          type: "tool-call",
          toolCallId: call.id,
          toolName: call.name,
          input: call.input && typeof call.input === "object" ? call.input : {},
        });
      }
      return { role: "assistant", content };
    }
    if (m.role === "tool") {
      return {
        role: "tool",
        content: m.results.map((r) => ({
          type: "tool-result",
          toolCallId: r.id,
          toolName: r.name,
          output: { type: "json", value: r.output },
        })),
      };
    }
    throw new Error(`Unknown message role: ${m.role}`);
  });
}

export class ModelError extends Error {
  constructor(kind, message, cause) {
    super(message);
    this.name = "ModelError";
    this.kind = kind; // rate_limit | auth | tool_use_failed | model_unavailable | context_too_large | timeout | network | other
    this.cause = cause;
  }
}

export function classifyModelError(err) {
  const base = err?.lastError ?? err;
  const status = base?.statusCode ?? base?.status;
  const text = `${base?.message ?? ""} ${base?.responseBody ?? ""}`.toLowerCase();

  if (text.includes("tool_use_failed") || text.includes("failed to call a function")) {
    return new ModelError("tool_use_failed", "The model produced a malformed tool call.", err);
  }
  if (status === 413 || text.includes("request too large") || text.includes("context length") || text.includes("context_length")) {
    return new ModelError("context_too_large", "The conversation is too large for the model's limits.", err);
  }
  if (status === 401 || status === 403 || text.includes("invalid api key")) {
    return new ModelError("auth", "The model provider rejected the API key.", err);
  }
  if (status === 429 || text.includes("rate limit")) {
    return new ModelError("rate_limit", "The model provider's rate limit was reached.", err);
  }
  if (status === 404 || text.includes("decommissioned") || text.includes("model not found") || (status >= 500 && status < 600)) {
    return new ModelError("model_unavailable", `The model is unavailable (${status ?? "unknown status"}).`, err);
  }
  if (base?.name === "TimeoutError" || base?.name === "AbortError" || text.includes("aborted")) {
    return new ModelError("timeout", "The model call timed out.", err);
  }
  if (["ECONNREFUSED", "ENOTFOUND", "ECONNRESET", "ETIMEDOUT"].includes(base?.code) || text.includes("fetch failed")) {
    return new ModelError("network", "Could not reach the model provider.", err);
  }
  return new ModelError("other", base?.message || String(err), err);
}

const FALLBACK_KINDS = new Set(["rate_limit", "model_unavailable", "timeout"]);

/**
 * Model client backed by the existing AIService (same key resolution as chat mode).
 */
export class AIServiceModelClient {
  constructor(aiService, { timeoutMs = 120_000, maxOutputTokens = 8192, reasoningEffort = "medium" } = {}) {
    this.ai = aiService;
    this.timeoutMs = timeoutMs;
    this.maxOutputTokens = maxOutputTokens;
    this.reasoningEffort = reasoningEffort;
    this.ready = false;
  }

  async init() {
    if (!this.ready) {
      await this.ai.ensureApiKey();
      this.ready = true;
    }
  }

  async generate({ system, messages, tools }) {
    await this.init();
    const toolSet = Object.fromEntries(
      Object.entries(tools).map(([name, def]) => [name, tool({ description: def.description, inputSchema: def.inputSchema })])
    );
    const modelMessages = toModelMessages(messages);

    const call = (model) =>
      generateText({
        model,
        system,
        messages: modelMessages,
        tools: toolSet,
        toolChoice: "auto",
        maxOutputTokens: this.maxOutputTokens,
        maxRetries: 2,
        abortSignal: AbortSignal.timeout(this.timeoutMs),
        providerOptions: { groq: { reasoningEffort: this.reasoningEffort } },
      });

    let result;
    try {
      result = await call(this.ai.model);
    } catch (err) {
      const classified = classifyModelError(err);
      if (!FALLBACK_KINDS.has(classified.kind) || !this.ai.fallbackModel) throw classified;
      try {
        result = await call(this.ai.fallbackModel);
      } catch (fallbackErr) {
        throw classifyModelError(fallbackErr);
      }
    }
    return normalizeResult(result);
  }
}

export function normalizeResult(result) {
  return {
    text: result.text ?? "",
    toolCalls: (result.toolCalls ?? []).map((tc) => ({
      id: tc.toolCallId,
      name: tc.toolName,
      input: tc.input,
      invalid: Boolean(tc.invalid),
      error: tc.invalid ? String(tc.error?.message ?? tc.error ?? "invalid tool call") : undefined,
    })),
    usage: {
      inputTokens: result.usage?.inputTokens ?? 0,
      outputTokens: result.usage?.outputTokens ?? 0,
    },
    finishReason: result.finishReason,
  };
}
