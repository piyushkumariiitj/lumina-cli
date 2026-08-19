import { groq } from "@ai-sdk/groq";
import { streamText } from "ai";
import { config } from "../../config/groq.config.js";
import chalk from "chalk";

export class AIService {
  constructor() {
    if (!config.groqApiKey) {
      throw new Error(
        "GROQ_API_KEY is not set in environment variables. Please add GROQ_API_KEY to your server/.env file."
      );
    }

    this.model = groq(config.model, {
      apiKey: config.groqApiKey,
    });

    this.fallbackModel = groq(config.fallbackModel || "qwen/qwen3.6-27b", {
      apiKey: config.groqApiKey,
    });
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
      errorMsg.toLowerCase().includes("unauthorized")
    ) {
      return new Error(
        "Invalid Groq API Key. Please check your GROQ_API_KEY in the server/.env file."
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
    isFallback = false
  ) {
    try {
      const activeModel = isFallback ? this.fallbackModel : this.model;
      const modelName = isFallback ? config.fallbackModel : config.model;

      const streamConfig = {
        model: activeModel,
        system: `You are Lumina CLI, an AI-powered Software Engineering Agent powered by Groq (${modelName}). You help developers build, analyze, and debug software. Always provide complete, accurate, and high-quality answers with clean code examples where appropriate.`,
        messages: messages,
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
        }
      }

      const [steps, finishReason, usage] = await Promise.all([
        Promise.resolve(result.steps).catch(() => []),
        Promise.resolve(result.finishReason).catch(() => undefined),
        Promise.resolve(result.usage).catch(() => undefined),
      ]);

      // If text stream was empty but tool results were generated, synthesize a clean response
      if (!fullResponse.trim() && toolResults.length > 0) {
        fullResponse = toolResults
          .map((tr) => {
            const out = tr.output ?? tr.result;
            if (out && typeof out === "object") {
              if (out.result !== undefined) {
                return `**Result**: \`${out.result}\`` + (out.expression ? ` (for \`${out.expression}\`)` : "");
              }
              if (out.error) {
                return `⚠️ ${out.error}`;
              }
              return Object.entries(out)
                .map(([k, v]) => `• **${k}**: ${typeof v === "object" ? JSON.stringify(v) : v}`)
                .join("\n");
            }
            return String(out || "Executed successfully");
          })
          .join("\n\n");
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
