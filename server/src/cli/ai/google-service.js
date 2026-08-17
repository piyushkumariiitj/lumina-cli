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
  }

  /**
   * Send a message and get streaming response
   * @param {Array} messages - Array of message objects {role, content}
   * @param {Function} onChunk - Callback for each text chunk
   * @param {Object} tools - Optional tools object
   * @param {Function} onToolCall - Callback for tool calls
   * @returns {Promise<Object>} Full response with content, tool calls, and usage
   */
  async sendMessage(messages, onChunk) {
    try {
      const streamConfig = {
        model: this.model,
        system: `You are Lumina CLI, an AI-powered Software Engineering Agent powered by Google Gemini (${config.model}). You help developers build, analyze, and debug software.`,
        messages: messages
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
