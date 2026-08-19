import { text, isCancel, confirm } from "@clack/prompts";
import { AIService } from "../ai/groq-service.js";
import { ChatService } from "../../services/chat-services.js";
import { getStoredToken } from "../../lib/token.js";
import prisma from "../../lib/db.js";
import { generateApplication } from "../../config/agent.config.js";
import { renderSessionHeader, renderError, renderGoodbye } from "../ui/components.js";
import { theme } from "../ui/theme.js";

const aiService = new AIService();
const chatService = new ChatService();

async function getUserFromToken() {
  const token = await getStoredToken();

  if (!token?.access_token) {
    throw new Error("Not authenticated. Please run 'lumina login' first.");
  }

  if (token.user) {
    return token.user;
  }

  try {
    const user = await Promise.race([
      prisma.user.findFirst({
        where: {
          sessions: {
            some: { token: token.access_token },
          },
        },
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 1000)),
    ]);
    if (user) return user;
  } catch {
    // Fallback
  }

  return { id: token.access_token.slice(0, 12), name: "Developer", email: "local@lumina" };
}

async function initConversation(userId, conversationId = null) {
  let conversation = null;
  try {
    conversation = await chatService.getOrCreateConversation(
      userId,
      conversationId,
      "agent"
    );
  } catch {
    conversation = { id: "local-agent-session", title: "Autonomous Agent", mode: "agent", messages: [] };
  }

  renderSessionHeader({
    title: conversation.title,
    mode: "agent",
    conversationId: conversation.id,
  });

  return conversation;
}

async function saveMessage(conversationId, role, content) {
  try {
    return await chatService.addMessage(conversationId, role, content);
  } catch {
    return null;
  }
}

async function agentLoop(conversation) {
  while (true) {
    const userInput = await text({
      message: theme.agent("🤖 App description"),
      placeholder: "e.g. Build a REST API with Express and Prisma...",
      validate(value) {
        if (!value || value.trim().length === 0) {
          return "Description cannot be empty";
        }
        if (value.trim().length < 8) {
          return "Please provide more details (at least 8 characters)";
        }
      },
    });

    if (isCancel(userInput)) {
      renderGoodbye();
      process.exit(0);
    }

    const trimmed = userInput.trim();

    if (trimmed.toLowerCase() === "exit" || trimmed.toLowerCase() === "quit") {
      renderGoodbye();
      break;
    }

    if (trimmed.toLowerCase() === "/clear" || trimmed.toLowerCase() === "clear") {
      console.clear();
      renderSessionHeader({
        title: conversation.title,
        mode: "agent",
        conversationId: conversation.id,
      });
      continue;
    }

    await saveMessage(conversation.id, "user", trimmed);

    try {
      const result = await generateApplication(
        trimmed,
        aiService,
        process.cwd()
      );

      if (result && result.success) {
        const responseMessage =
          `Generated application: ${result.folderName}\n` +
          `Files created: ${result.files.length}\n` +
          `Location: ${result.appDir}\n\n` +
          `Setup commands:\n${result.commands.join("\n")}`;

        await saveMessage(conversation.id, "assistant", responseMessage);

        const continuePrompt = await confirm({
          message: "Would you like to build another application?",
          initialValue: false,
        });

        if (isCancel(continuePrompt) || !continuePrompt) {
          renderGoodbye("Application files generated successfully.");
          break;
        }
      }
    } catch (error) {
      await saveMessage(conversation.id, "assistant", `Error: ${error.message}`);

      const retry = await confirm({
        message: "Would you like to try again with a revised prompt?",
        initialValue: true,
      });

      if (isCancel(retry) || !retry) {
        renderGoodbye();
        break;
      }
    }
  }
}

export async function startAgentChat(conversationId = null) {
  try {
    const user = await getUserFromToken();

    const shouldContinue = await confirm({
      message: "The agent will create files in your current working directory. Proceed?",
      initialValue: true,
    });

    if (isCancel(shouldContinue) || !shouldContinue) {
      renderGoodbye("Agent mode cancelled.");
      process.exit(0);
    }

    const conversation = await initConversation(user.id, conversationId);
    await agentLoop(conversation);
  } catch (error) {
    renderError("Agent Mode Error", error.message);
    process.exit(1);
  }
}