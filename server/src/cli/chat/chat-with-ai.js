import { text, isCancel } from "@clack/prompts";
import yoctoSpinner from "yocto-spinner";
import { AIService } from "../ai/groq-service.js";
import { ChatService } from "../../services/chat-services.js";
import { getStoredToken } from "../../lib/token.js";
import prisma from "../../lib/db.js";
import { renderMarkdown } from "../ui/markdown.js";
import { 
  renderSessionHeader, 
  renderError, 
  renderGoodbye 
} from "../ui/components.js";
import { theme, symbols } from "../ui/theme.js";
import { config } from "../../config/groq.config.js";

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

async function initConversation(userId, conversationId = null, mode = "chat") {
  let conversation = null;
  try {
    conversation = await chatService.getOrCreateConversation(
      userId,
      conversationId,
      mode
    );
  } catch {
    conversation = { id: "local-session", title: "Chat", mode: "chat", messages: [] };
  }

  renderSessionHeader({
    title: conversation.title,
    mode: "chat",
    conversationId: conversation.id,
  });

  if (conversation.messages?.length > 0) {
    displayMessages(conversation.messages);
  }

  return conversation;
}

function displayMessages(messages) {
  messages.forEach((msg) => {
    if (msg.role === "user") {
      console.log(`\n${theme.userBold("You:")} ${theme.white(msg.content)}`);
    } else {
      console.log(`\n${theme.agentBold("Lumina:")}\n${renderMarkdown(msg.content)}\n`);
    }
  });
}

async function saveMessage(conversationId, role, content) {
  try {
    return await chatService.addMessage(conversationId, role, content);
  } catch {
    // Ignore database write failures in offline mode
    return null;
  }
}

async function getAIResponse(conversationId) {
  const spinner = yoctoSpinner({
    text: theme.muted("Thinking..."),
    color: "yellow",
  }).start();

  let aiMessages = [];
  try {
    const dbMessages = await chatService.getMessages(conversationId);
    aiMessages = chatService.formatMessagesForAI(dbMessages);
  } catch {
    // Fallback to minimal array
  }

  let fullResponse = "";
  let isFirstChunk = true;

  try {
    const result = await aiService.sendMessage(aiMessages, (chunk) => {
      if (isFirstChunk) {
        spinner.stop();
        console.log(`\n${theme.agentBold("Lumina:")}`);
        isFirstChunk = false;
      }
      process.stdout.write(chunk);
      fullResponse += chunk;
    });

    console.log("\n");
    return result.content;
  } catch (error) {
    if (spinner) {
      spinner.stop();
    }
    throw error;
  }
}

async function updateConversationTitle(conversationId, userInput, messageCount) {
  if (messageCount === 1) {
    const title = userInput.slice(0, 50) + (userInput.length > 50 ? "..." : "");
    try {
      await chatService.updateTitle(conversationId, title);
    } catch {
      // Offline mode
    }
  }
}

async function chatLoop(conversation) {
  while (true) {
    const userInput = await text({
      message: theme.accent("❯"),
      placeholder: "Type your message or 'exit'...",
      validate(value) {
        if (!value || value.trim().length === 0) {
          return "Message cannot be empty";
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
        mode: "chat",
        conversationId: conversation.id,
      });
      continue;
    }

    try {
      await saveMessage(conversation.id, "user", trimmed);
      let msgCount = 1;
      try {
        const msgs = await chatService.getMessages(conversation.id);
        msgCount = msgs.length;
      } catch {}

      const aiResponse = await getAIResponse(conversation.id);

      if (aiResponse) {
        await saveMessage(conversation.id, "assistant", aiResponse);
        await updateConversationTitle(conversation.id, trimmed, msgCount);
      }
    } catch (error) {
      renderError("Error", error.message);
    }
  }
}

export async function startChat(mode = "chat", conversationId = null) {
  try {
    const user = await getUserFromToken();
    const conversation = await initConversation(user.id, conversationId, mode);
    await chatLoop(conversation);
  } catch (error) {
    renderError("Chat Error", error.message);
    process.exit(1);
  }
}