import { google } from "@ai-sdk/google";
import { streamText, generateObject } from "ai";
import { config } from "../../config/google.config.js";
import chalk from "chalk";

export class AIService {
  constructor() {
    if (!config.googleApiKey) {
      throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not set in environment variables");
    }
    
    this.model = google(config.model, {
      apiKey: config.googleApiKey,
    });

    this.fallbackModel = google(config.fallbackModel || 'gemini-2.5-flash-lite', {
      apiKey: config.googleApiKey,
    });
  }

  /**
   * Send a message and get streaming response
   * @param {Array} messages - Array of message objects {role, content}
   * @param {Function} onChunk - Callback for each text chunk
   * @param {boolean} isFallback - Whether this is a fallback attempt
   * @returns {Promise<Object>} Full response with content, tool calls, and usage
   */
  async sendMessage(messages, onChunk, isFallback = false) {
    try {
      const streamConfig = {
        model: isFallback ? this.fallbackModel : this.model,
        system: `You are Lumina CLI, an AI-powered Software Engineering Agent powered by Google Gemini (${isFallback ? config.fallbackModel : config.model}). You help developers build, analyze, and debug software.`,
        messages: messages,
        maxRetries: 0,
      };

      const result = streamText(streamConfig);
      
      let fullResponse = "";
      
      for await (const chunk of result.textStream) {
        fullResponse += chunk;
        if (onChunk) {
          onChunk(chunk);
        }
      }

      const fullResult = await result;

      return {
        content: fullResponse,
        finishReason: fullResult.finishReason,
        usage: fullResult.usage,
      };
    } catch (error) {
      if (!isFallback && (error.statusCode === 429 || error.message?.includes('Quota exceeded') || error.message?.includes('429') || error.message?.includes('not found') || error.message?.includes('no longer available'))) {
        console.log(chalk.yellow(`\n⚠️ Primary model (${config.model}) failed or quota exceeded. Falling back to ${config.fallbackModel}...\n`));
        return this.sendMessage(messages, onChunk, true);
      }

      if (error.statusCode === 429 || error.message?.includes('Quota exceeded') || error.message?.includes('429')) {
        throw new Error("Rate limit or free tier daily quota exceeded for Gemini API. Please wait a minute before retrying or check your API key quota at https://ai.dev/rate-limit.");
      }
      throw error;
    }
  }

  /**
   * Get a non-streaming response
   * @param {Array} messages - Array of message objects
   * @returns {Promise<string>} Response text
   */
  async getMessage(messages) {
    let fullResponse = "";
    await this.sendMessage(messages, (chunk) => {
      fullResponse += chunk;
    });
    return fullResponse;
  }
}
