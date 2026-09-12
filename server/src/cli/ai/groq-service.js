import { createGroq } from "@ai-sdk/groq";
import { streamText } from "ai";
import { config } from "../../config/groq.config.js";
import chalk from "chalk";
import { password, isCancel } from "@clack/prompts";
import { getStoredApiKey, storeApiKey, getStoredToken } from "../../lib/token.js";
import { resolveServerUrl } from "../../lib/server-url.js";

export class AIService {
  constructor() {
    this.apiKey = (config.groqApiKey || process.env.GROQ_API_KEY || "").trim();
    this.model = null;
    this.fallbackModel = null;
    this.groqProvider = null;

    if (this.apiKey) {
      process.env.GROQ_API_KEY = this.apiKey;
      this.groqProvider = createGroq({ apiKey: this.apiKey });
      this.model = this.groqProvider(config.model);
      this.fallbackModel = this.groqProvider(config.fallbackModel || "openai/gpt-oss-20b");
    }
  }

  /**
   * Ensure API key is available or prompt user interactively
   */
  async ensureApiKey() {
    // 1. Always prioritize active environment variables (e.g. from local server/.env or CLI env)
    const envKey = (process.env.GROQ_API_KEY || config.groqApiKey || "").trim();
    if (envKey) {
      if (this.apiKey !== envKey || !this.model) {
        this.apiKey = envKey;
        process.env.GROQ_API_KEY = this.apiKey;
        this.groqProvider = createGroq({ apiKey: this.apiKey });
        this.model = this.groqProvider(config.model);
        this.fallbackModel = this.groqProvider(config.fallbackModel || "openai/gpt-oss-20b");
      }
      return this.apiKey;
    }

    // 2. Automatically retrieve AI configuration from backend server for logged-in users
    try {
      const token = await getStoredToken();
      if (token?.access_token) {
        const serverUrl = await resolveServerUrl();
        const res = await fetch(`${serverUrl}/api/ai/config`, {
          headers: {
            Authorization: `Bearer ${token.access_token}`,
            Cookie: `better-auth.session_token=${token.access_token}`,
          },
          signal: AbortSignal.timeout(3500),
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.apiKey && data.apiKey.trim()) {
            this.apiKey = data.apiKey.trim();
            process.env.GROQ_API_KEY = this.apiKey;
            this.groqProvider = createGroq({ apiKey: this.apiKey });
            this.model = this.groqProvider(data.model || config.model);
            this.fallbackModel = this.groqProvider(data.fallbackModel || config.fallbackModel || "openai/gpt-oss-20b");
            return this.apiKey;
          }
        }
      }
    } catch {
      // Backend fetch failed or server offline, proceed to local fallbacks
    }

    // 3. Check stored key in local token (~/.better-auth/token.json)
    const stored = ((await getStoredApiKey()) || "").trim();
    if (stored) {
      this.apiKey = stored;
      process.env.GROQ_API_KEY = this.apiKey;
      this.groqProvider = createGroq({ apiKey: this.apiKey });
      this.model = this.groqProvider(config.model);
      this.fallbackModel = this.groqProvider(config.fallbackModel || "openai/gpt-oss-20b");
      return this.apiKey;
    }

    // 4. Prompt user interactively as a last resort
    console.log(chalk.cyan("\n🔑 Groq API key is required to power Lumina AI."));
    console.log(chalk.gray("   Get a 100% free API key at: https://console.groq.com/keys\n"));

    const enteredKey = await password({
      message: "Enter your Groq API Key (starts with gsk_):",
      validate(val) {
        if (!val || val.trim().length === 0) return "API Key cannot be empty";
        if (!val.trim().startsWith("gsk_")) return "Groq API key must start with 'gsk_'";
      },
    });

    if (isCancel(enteredKey)) {
      process.exit(0);
    }

    const trimmed = enteredKey.trim();
    this.apiKey = trimmed;
    process.env.GROQ_API_KEY = this.apiKey;
    await storeApiKey(trimmed);

    this.groqProvider = createGroq({ apiKey: this.apiKey });
    this.model = this.groqProvider(config.model);
    this.fallbackModel = this.groqProvider(config.fallbackModel || "openai/gpt-oss-20b");
    return this.apiKey;
  }

  /**
   * Helper to categorize and format errors gracefully
   */
  handleAIError(error, isFallback = false) {
    const errorMsg = error?.message || String(error);
    const status = error?.status || error?.statusCode || error?.response?.status;

    // 1. Invalid API Key
    if (
      status === 401 ||
      errorMsg.includes("401") ||
      errorMsg.toLowerCase().includes("invalid api key") ||
      errorMsg.toLowerCase().includes("invalid_api_key") ||
      errorMsg.toLowerCase().includes("unauthorized")
    ) {
      // Clear cached bad key from token file
      storeApiKey("").catch(() => {});
      this.apiKey = "";
      this.model = null;

      return new Error(
        "Invalid Groq API Key. Please verify your GROQ_API_KEY in server/.env or obtain a new free key at https://console.groq.com/keys"
      );
    }

    // 2. Rate Limits
    if (
      status === 429 ||
      errorMsg.includes("429") ||
      errorMsg.toLowerCase().includes("rate limit") ||
      errorMsg.toLowerCase().includes("quota exceeded") ||
      errorMsg.toLowerCase().includes("tokens per minute") ||
      errorMsg.toLowerCase().includes("requests per minute")
    ) {
      return new Error(
        "Groq API rate limit reached (TPM/RPM exceeded). Please wait a moment before sending another message."
      );
    }

    // 3. Network failures
    if (
      error?.code === "ENOTFOUND" ||
      error?.code === "ECONNREFUSED" ||
      error?.code === "ETIMEDOUT" ||
      errorMsg.toLowerCase().includes("fetch failed") ||
      errorMsg.toLowerCase().includes("network error") ||
      errorMsg.toLowerCase().includes("econnreset")
    ) {
      return new Error(
        "Network connection error: Unable to reach Groq API. Please check your internet connection."
      );
    }

    // 4. Model decommissioned or unavailable
    if (
      status === 404 ||
      errorMsg.includes("404") ||
      errorMsg.toLowerCase().includes("model not found") ||
      errorMsg.toLowerCase().includes("decommissioned") ||
      errorMsg.toLowerCase().includes("not supported")
    ) {
      return new Error(
        `Groq model '${config.model}' has been decommissioned or is unavailable. Please update LUMINA_MODEL in server/.env (e.g. openai/gpt-oss-120b).`
      );
    }

    return error instanceof Error ? error : new Error(errorMsg);
  }

  /**
   * Send a message and get streaming response
   * @param {Array} messages - Array of message objects {role, content}
   * @param {Function} onChunk - Callback for each text chunk
   * @param {Object} tools - Optional tools object
   * @param {Function} onToolCall - Callback for tool calls
   * @param {boolean} isFallback - Whether this is a fallback attempt
   * @returns {Promise<Object>} Full response with content, tool calls, and usage
   */
  async sendMessage(
    messages,
    onChunk,
    tools = undefined,
    onToolCall = undefined,
    onToolResult = undefined,
    isFallback = false
  ) {
    await this.ensureApiKey();
    try {
      const activeModel = isFallback ? this.fallbackModel : this.model;
      const modelName = isFallback ? config.fallbackModel : config.model;

      // Sanitize and validate messages array to ensure it is never empty
      const validMessages = (Array.isArray(messages) ? messages : [])
        .filter((m) => m && m.content)
        .map((m) => ({
          role: m.role || "user",
          content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
        }));

      if (validMessages.length === 0) {
        throw new Error("Cannot send empty prompt to AI model.");
      }

      const streamConfig = {
        model: activeModel,
        system: `You are Lumina CLI, an expert AI Software Engineering Agent powered by Groq (${modelName}). You help developers build, analyze, and debug software. Always provide clean, direct, and well-structured natural language answers with markdown formatting. Format data and lists using clean bullet points and bold keys (e.g. • **Parameter**: Value) rather than markdown tables for optimal terminal rendering.`,
        messages: validMessages,
        maxRetries: 1,
        maxTokens: 4096,
        providerOptions: {
          groq: {
            reasoningFormat: "hidden",
            reasoningEffort: "low",
          },
        },
      };

      if (tools && Object.keys(tools).length > 0) {
        streamConfig.tools = tools;
        streamConfig.maxSteps = 5;
      }

      const result = streamText(streamConfig);

      let fullResponse = "";
      const toolCalls = [];
      const toolResults = [];

      for await (const part of result.fullStream) {
        if (part.type === "text-delta") {
          const textChunk = part.text ?? part.textDelta ?? "";
          if (textChunk) {
            fullResponse += textChunk;
            if (onChunk) {
              onChunk(textChunk);
            }
          }
        } else if (part.type === "tool-call") {
          toolCalls.push(part);
          if (onToolCall) {
            onToolCall(part);
          }
        } else if (part.type === "tool-result") {
          toolResults.push(part);
          if (onToolResult) {
            onToolResult(part);
          }
        }
      }

      const [steps, finishReason, usage] = await Promise.all([
        Promise.resolve(result.steps).catch(() => []),
        Promise.resolve(result.finishReason).catch(() => undefined),
        Promise.resolve(result.usage).catch(() => undefined),
      ]);

      // If text stream was empty but tool results were generated, synthesize a clean natural answer
      if (!fullResponse.trim() && toolResults.length > 0) {
        try {
          const lastUserMsg = validMessages[validMessages.length - 1]?.content || "User request";
          const toolData = toolResults.map((tr) => tr.output ?? tr.result);

          const synthStream = streamText({
            model: activeModel,
            system: `You are Lumina CLI. Synthesize the provided tool data and answer the user query directly, concisely, and cleanly in natural language with markdown bullet points (e.g. • **Parameter**: Value). Do NOT use markdown tables or raw JSON dumps.`,
            messages: [
              {
                role: "user",
                content: `User query: "${lastUserMsg}"\n\nTool Execution Results:\n${JSON.stringify(toolData, null, 2)}\n\nPlease provide a clear, helpful, and natural language response answering the query:`,
              },
            ],
            maxTokens: 1024,
          });

          for await (const chunk of synthStream.textStream) {
            if (chunk) {
              fullResponse += chunk;
              if (onChunk) {
                onChunk(chunk);
              }
            }
          }
        } catch {
          // Fallback formatting if synthesis stream fails
          fullResponse = toolResults
            .map((tr) => {
              const out = tr.output ?? tr.result;
              if (out && typeof out === "object") {
                if (out.results && Array.isArray(out.results)) {
                  return out.results
                    .slice(0, 4)
                    .map((r) => `• **${r.title}**: ${r.snippet}\n  ${r.url}`)
                    .join("\n\n");
                }
                if (out.result !== undefined) {
                  return `**Result**: \`${out.result}\``;
                }
                if (out.output) {
                  return String(out.output);
                }
              }
              return String(out || "");
            })
            .join("\n\n");
        }
      }

      // Check for empty response only if NO text AND NO tools were executed
      if (!fullResponse.trim() && toolCalls.length === 0) {
        throw new Error(
          "Received an empty response from Groq API. Please try rephrasing your request."
        );
      }

      return {
        content: fullResponse,
        finishReason,
        usage,
        toolCalls: toolCalls || [],
        toolResults: toolResults || [],
        steps: steps || [],
      };
    } catch (error) {
      const errorMsg = error?.message || "";
      const status = error?.status || error?.statusCode;
      const isRateOrModelErr =
        status === 429 ||
        status === 404 ||
        status === 400 ||
        errorMsg.includes("429") ||
        errorMsg.includes("404") ||
        errorMsg.includes("decommissioned") ||
        errorMsg.toLowerCase().includes("rate limit") ||
        errorMsg.toLowerCase().includes("quota");

      if (!isFallback && isRateOrModelErr) {
        console.log(
          chalk.yellow(
            `\n⚠️ Primary model (${config.model}) limit reached or decommissioned. Trying fallback model (${config.fallbackModel})...\n`
          )
        );
        return this.sendMessage(messages, onChunk, tools, onToolCall, true);
      }

      throw this.handleAIError(error, isFallback);
    }
  }

  /**
   * Get a non-streaming response
   * @param {Array} messages - Array of message objects
   * @param {Object} tools - Object containing available tools
   * @returns {Promise<string>} Response text
   */
  async getMessage(messages, tools = undefined) {
    let fullResponse = "";
    const result = await this.sendMessage(
      messages,
      (chunk) => {
        fullResponse += chunk;
      },
      tools
    );
    return result.content;
  }
}
