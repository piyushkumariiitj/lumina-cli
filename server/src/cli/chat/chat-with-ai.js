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
import { theme } from "../ui/theme.js";

const aiService = new AIService();
const chatService = new ChatService();

// In-memory active message store to guarantee conversation state even when DB is slow or offline
let activeMessages = [];

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
  activeMessages = [];

  try {
    conversation = await chatService.getOrCreateConversation(
      userId,
      conversationId,
      mode
    );
    if (conversation?.messages?.length > 0) {
      activeMessages = conversation.messages.map((m) => ({
        role: m.role,
        content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
      }));
    }
  } catch {
    conversation = { id: "local-session", title: "Chat", mode: "chat", messages: [] };
  }

  renderSessionHeader({
    title: conversation.title,
    mode: "chat",
    conversationId: conversation.id,
  });

  if (activeMessages.length > 0) {
    displayMessages(activeMessages);
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
    return null;
  }
}

async function getAIResponse(conversationId) {
  const spinner = yoctoSpinner({
    text: theme.muted("Thinking..."),
    color: "yellow",
  }).start();

  let fullResponse = "";

  try {
    const result = await aiService.sendMessage(activeMessages, (chunk) => {
      fullResponse += chunk;
    });

    spinner.stop();

    if (result.content) {
      console.log(`\n${theme.agentBold("Lumina:")}\n${renderMarkdown(result.content)}\n`);
    } else {
      console.log("\n");
    }

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
    } catch {}
  }
}

async function chatLoop(conversation) {
  while (true) {
    const userInput = await text({
      message: theme.user("❯"),
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
      // Always push to in-memory activeMessages so prompts are never empty
      activeMessages.push({ role: "user", content: trimmed });

      // Async DB write
      saveMessage(conversation.id, "user", trimmed);

      const aiResponse = await getAIResponse(conversation.id);

      if (aiResponse) {
        activeMessages.push({ role: "assistant", content: aiResponse });
        saveMessage(conversation.id, "assistant", aiResponse);
        updateConversationTitle(conversation.id, trimmed, activeMessages.length);
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