import { createGroq } from "@ai-sdk/groq";
import { streamText, stepCountIs } from "ai";
import { config } from "../../config/groq.config.js";
import chalk from "chalk";
import { password, isCancel } from "@clack/prompts";
import { getStoredApiKey, storeApiKey, getStoredToken, isTokenExpired } from "../../lib/token.js";
import { resolveServerUrl } from "../../lib/server-url.js";
import { classifyModelError } from "../../agent/model-client.js";

const SYSTEM_PROMPT = (modelName) =>
  `You are Lumina CLI, an expert AI Software Engineering Agent powered by Groq (${modelName}). You help developers build, analyze, and debug software. Always provide clean, direct, and well-structured natural language answers with markdown formatting. Format data and lists using clean bullet points and bold keys (e.g. • **Parameter**: Value) rather than markdown tables for optimal terminal rendering.`;

const FALLBACK_KINDS = new Set(["rate_limit", "model_unavailable", "timeout"]);

/**
 * Model access for every CLI mode. Credentials are resolved in this order:
 *   1. GROQ_API_KEY in the environment (your own key, called directly)
 *   2. a valid `lumina login` session → the Lumina server's proxy (the provider
 *      key stays on the server); older servers may still return a key instead
 *   3. a key previously entered and stored in ~/.better-auth/token.json
 *   4. an interactive prompt (terminal only)
 */
export class AIService {
  constructor() {
    this.mode = null; // "direct" | "proxy"
    this.apiKey = "";
    this.model = null;
    this.fallbackModel = null;
    this.modelName = config.model;
    this.fallbackModelName = config.fallbackModel;
    this.keySource = null; // "env" | "server" | "stored" | "prompt"
  }

  #setProvider(provider, models = {}) {
    this.modelName = models.model || config.model;
    this.fallbackModelName = models.fallbackModel || config.fallbackModel || "openai/gpt-oss-20b";
    this.model = provider(this.modelName);
    this.fallbackModel = provider(this.fallbackModelName);
  }

  #useKey(apiKey, source, models) {
    this.mode = "direct";
    this.apiKey = apiKey;
    this.keySource = source;
    this.#setProvider(createGroq({ apiKey }), models);
  }

  #useProxy(baseURL, sessionToken, models) {
    this.mode = "proxy";
    this.apiKey = "";
    this.keySource = "server";
    // The Lumina session token goes in the Authorization header; the server swaps in its key.
    this.#setProvider(createGroq({ baseURL, apiKey: sessionToken }), models);
  }

  /**
   * Resolves credentials once and returns the mode ("direct" or "proxy").
   * Kept under its historical name; it no longer always yields an API key.
   */
  async ensureApiKey() {
    if (this.model) return this.mode;

    const envKey = (process.env.GROQ_API_KEY || config.groqApiKey || "").trim();
    if (envKey) {
      this.#useKey(envKey, "env");
      return this.mode;
    }

    const token = await getStoredToken();
    const sessionExpired = Boolean(token?.access_token) && (await isTokenExpired());
    if (token?.access_token && !sessionExpired) {
      try {
        const serverUrl = await resolveServerUrl();
        const res = await fetch(`${serverUrl}/api/ai/config`, {
          headers: { Authorization: `Bearer ${token.access_token}` },
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.proxy?.path) {
            this.#useProxy(`${serverUrl}${data.proxy.path}`, token.access_token, data);
            return this.mode;
          }
          if (typeof data?.apiKey === "string" && data.apiKey.trim()) {
            this.#useKey(data.apiKey.trim(), "server", data);
            return this.mode;
          }
        }
      } catch {
        // Server unreachable: fall through to local credentials.
      }
    }

    const stored = ((await getStoredApiKey()) || "").trim();
    if (stored) {
      this.#useKey(stored, "stored");
      return this.mode;
    }

    if (!process.stdin.isTTY) {
      throw new Error("No model credentials. Run 'lumina login' or set GROQ_API_KEY.");
    }

    if (sessionExpired) {
      console.log(chalk.yellow("\n⚠ Your Lumina session has expired. Run 'lumina login' to use Lumina's hosted model again."));
    }
    console.log(chalk.cyan("\n🔑 A Groq API key is required to power Lumina AI."));
    console.log(chalk.gray("   Get a free API key at: https://console.groq.com/keys\n"));

    const enteredKey = await password({
      message: "Enter your Groq API Key (starts with gsk_):",
      validate(val) {
        if (!val || val.trim().length === 0) return "API Key cannot be empty";
        if (!val.trim().startsWith("gsk_")) return "Groq API key must start with 'gsk_'";
      },
    });
    if (isCancel(enteredKey)) process.exit(0);

    const trimmed = enteredKey.trim();
    await storeApiKey(trimmed);
    this.#useKey(trimmed, "prompt");
    return this.mode;
  }

  /**
   * Turns provider/proxy failures into actionable messages.
   */
  handleAIError(error) {
    const classified = classifyModelError(error);
    switch (classified.kind) {
      case "auth":
        if (this.mode === "proxy") {
          return new Error("Your Lumina session is no longer valid. Run 'lumina login' and try again.");
        }
        if (this.keySource === "stored" || this.keySource === "prompt") {
          storeApiKey("").catch(() => {});
        }
        this.model = null;
        return new Error(
          this.keySource === "env"
            ? "Groq rejected GROQ_API_KEY. Check the key or get a new one at https://console.groq.com/keys"
            : "Invalid Groq API key. It has been cleared; you will be asked for a new one next time."
        );
      case "rate_limit":
        return new Error("Rate limit reached (Groq or Lumina server). Please wait a moment before sending another message.");
      case "network":
        return new Error(
          this.mode === "proxy"
            ? "Network error: unable to reach the Lumina server. Check your connection."
            : "Network error: unable to reach the Groq API. Check your internet connection."
        );
      case "model_unavailable":
        return new Error(`Model '${this.modelName}' is unavailable right now (${classified.message}).`);
      case "timeout":
        return new Error("The model took too long to respond. Please try again.");
      case "tool_use_failed":
        return new Error("The model made an invalid tool call twice in a row. Please try again or rephrase your request.");
      default:
        return classified.cause instanceof Error ? classified.cause : new Error(classified.message);
    }
  }

  /**
   * Send a message and stream the response.
   * @param {Array} messages - Array of message objects {role, content}
   * @param {Function} onChunk - Callback for each text chunk
   * @param {Object} tools - Optional AI SDK tool set (enables up to 5 tool steps)
   * @param {Function} onToolCall - Callback for tool calls
   * @param {Function} onToolResult - Callback for tool results (and tool errors)
   * @param {boolean} isFallback - Whether this is the fallback-model attempt
   * @param {boolean} isToolRetry - Whether this is the retry after a rejected (malformed) tool call
   */
  async sendMessage(
    messages,
    onChunk,
    tools = undefined,
    onToolCall = undefined,
    onToolResult = undefined,
    isFallback = false,
    isToolRetry = false
  ) {
    await this.ensureApiKey();

    const validMessages = (Array.isArray(messages) ? messages : [])
      .filter((m) => m && m.content)
      .map((m) => ({
        role: m.role || "user",
        content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
      }));
    if (validMessages.length === 0) throw new Error("Cannot send empty prompt to AI model.");

    const modelName = isFallback ? this.fallbackModelName : this.modelName;
    const streamConfig = {
      model: isFallback ? this.fallbackModel : this.model,
      system: SYSTEM_PROMPT(modelName),
      messages: validMessages,
      maxRetries: 1,
      maxOutputTokens: 4096,
      abortSignal: AbortSignal.timeout(120_000),
      providerOptions: { groq: { reasoningFormat: "hidden", reasoningEffort: "low" } },
      // Errors are handled from the stream below; the SDK default would dump a stack trace.
      onError: () => {},
    };
    if (tools && Object.keys(tools).length > 0) {
      streamConfig.tools = tools;
      // Let the model see tool results and answer (the old `maxSteps` option no longer exists).
      streamConfig.stopWhen = stepCountIs(5);
    }

    let fullResponse = "";
    const toolCalls = [];
    const toolResults = [];

    try {
      const result = streamText(streamConfig);

      for await (const part of result.fullStream) {
        if (part.type === "text-delta") {
          const textChunk = part.text ?? part.textDelta ?? "";
          if (textChunk) {
            fullResponse += textChunk;
            onChunk?.(textChunk);
          }
        } else if (part.type === "tool-call") {
          toolCalls.push(part);
          onToolCall?.(part);
        } else if (part.type === "tool-result") {
          toolResults.push(part);
          onToolResult?.(part);
        } else if (part.type === "tool-error") {
          const failed = { ...part, output: { error: String(part.error?.message ?? part.error) } };
          toolResults.push(failed);
          onToolResult?.(failed);
        } else if (part.type === "error") {
          // Provider errors arrive as stream parts, not exceptions.
          throw part.error;
        }
      }

      const [steps, finishReason, usage] = await Promise.all([
        Promise.resolve(result.steps).catch(() => []),
        Promise.resolve(result.finishReason).catch(() => undefined),
        Promise.resolve(result.totalUsage ?? result.usage).catch(() => undefined),
      ]);

      // Step limit reached right after a tool call: show the tool data rather than nothing.
      if (!fullResponse.trim() && toolResults.length > 0) {
        fullResponse = formatToolResults(toolResults);
        onChunk?.(fullResponse);
      }
      if (!fullResponse.trim() && toolCalls.length === 0) {
        throw new Error("Received an empty response from the model. Please try rephrasing your request.");
      }

      return { content: fullResponse, finishReason, usage, toolCalls, toolResults, steps: steps || [] };
    } catch (error) {
      const kind = classifyModelError(error).kind;
      // The provider rejects tool calls whose arguments don't match the schema; models
      // usually get it right on a second attempt.
      if (kind === "tool_use_failed" && !isToolRetry) {
        return this.sendMessage(messages, onChunk, tools, onToolCall, onToolResult, isFallback, true);
      }
      if (!isFallback && this.fallbackModel && FALLBACK_KINDS.has(kind)) {
        console.log(
          chalk.yellow(`\n⚠️ Primary model (${this.modelName}) unavailable (${kind}). Trying fallback model (${this.fallbackModelName})...\n`)
        );
        return this.sendMessage(messages, onChunk, tools, onToolCall, onToolResult, true, isToolRetry);
      }
      throw this.handleAIError(error);
    }
  }

  /**
   * Get a non-streaming response
   */
  async getMessage(messages, tools = undefined) {
    const result = await this.sendMessage(messages, () => {}, tools);
    return result.content;
  }
}

function formatToolResults(toolResults) {
  return toolResults
    .map((tr) => {
      const out = tr.output ?? tr.result;
      if (out && typeof out === "object") {
        if (Array.isArray(out.results)) {
          return out.results
            .slice(0, 4)
            .map((r) => `• **${r.title}**: ${r.snippet}\n  ${r.url}`)
            .join("\n\n");
        }
        if (out.error) return `**${tr.toolName}** failed: ${out.error}`;
        if (out.result !== undefined) return `**Result**: \`${out.result}\``;
        if (out.output) return String(out.output);
        if (out.content) return "```\n" + String(out.content).slice(0, 2000) + "\n```";
      }
      return String(out ?? "");
    })
    .join("\n\n");
}
