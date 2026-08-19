import { text, isCancel, multiselect } from "@clack/prompts";
import yoctoSpinner from "yocto-spinner";
import { AIService } from "../ai/groq-service.js";
import { ChatService } from "../../services/chat-services.js";
import { getStoredToken } from "../../lib/token.js";
import prisma from "../../lib/db.js";
import { 
  availableTools, 
  getEnabledTools, 
  enableTools, 
  getEnabledToolNames,
  resetTools,
  setLastUserQuery 
} from "../../config/tool.config.js";
import { renderMarkdown } from "../ui/markdown.js";
import { 
  renderSessionHeader, 
  renderToolExecution, 
  renderToolResult, 
  renderError, 
  renderGoodbye 
} from "../ui/components.js";
import { theme } from "../ui/theme.js";
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

async function selectTools() {
  const toolOptions = availableTools.map((tool) => ({
    value: tool.id,
    label: tool.name,
    hint: tool.description,
  }));

  const selectedTools = await multiselect({
    message: "Select tools to enable:",
    options: toolOptions,
    required: false,
  });

  if (isCancel(selectedTools)) {
    renderGoodbye("Cancelled tool selection.");
    process.exit(0);
  }

  enableTools(selectedTools);

  if (selectedTools.length === 0) {
    console.log(theme.muted("\n  ℹ No tools selected. Running standard conversational mode.\n"));
  } else {
    const names = getEnabledToolNames();
    console.log(theme.success(`\n  ✔ Enabled: ${names.join(", ")}\n`));
  }

  return selectedTools.length > 0;
}

async function initConversation(userId, conversationId = null, mode = "tool") {
  let conversation = null;
  try {
    conversation = await chatService.getOrCreateConversation(
      userId,
      conversationId,
      mode
    );
  } catch {
    conversation = { id: "local-tool-session", title: "Tool Calling", mode: "tool", messages: [] };
  }

  const enabledToolNames = getEnabledToolNames();
  renderSessionHeader({
    title: conversation.title,
    mode: "tool",
    conversationId: conversation.id,
    activeTools: enabledToolNames,
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
    } else if (msg.role === "assistant") {
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

  let aiMessages = [];
  try {
    const dbMessages = await chatService.getMessages(conversationId);
    aiMessages = chatService.formatMessagesForAI(dbMessages);
  } catch {
    // Offline mode
  }

  const tools = getEnabledTools();

  let fullResponse = "";
  let isFirstChunk = true;

  try {
    const result = await aiService.sendMessage(
      aiMessages,
      (chunk) => {
        if (isFirstChunk) {
          spinner.stop();
          console.log(`\n${theme.agentBold("Lumina:")}`);
          isFirstChunk = false;
        }
        process.stdout.write(chunk);
        fullResponse += chunk;
      },
      tools,
      (toolCall) => {
        spinner.stop();
        renderToolExecution(
          toolCall.toolName || toolCall.name || "Tool",
          toolCall.args || toolCall.input || {}
        );
      }
    );

    if (result.toolResults && result.toolResults.length > 0) {
      result.toolResults.forEach((tr) => {
        const out = tr.result !== undefined ? tr.result : tr.output;
        renderToolResult(tr.toolName || "Tool", out, !out?.error);
      });
    }

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
    } catch {}
  }
}

async function chatLoop(conversation) {
  while (true) {
    const userInput = await text({
      message: theme.tool("❯"),
      placeholder: "Ask something or type 'exit'...",
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
      const enabledToolNames = getEnabledToolNames();
      renderSessionHeader({
        title: conversation.title,
        mode: "tool",
        conversationId: conversation.id,
        activeTools: enabledToolNames,
      });
      continue;
    }

    try {
      setLastUserQuery(trimmed);
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

export async function startToolChat(conversationId = null) {
  try {
    const user = await getUserFromToken();

    await selectTools();

    const conversation = await initConversation(user.id, conversationId, "tool");
    await chatLoop(conversation);

    resetTools();
  } catch (error) {
    renderError("Tool Mode Error", error.message);
    resetTools();
    process.exit(1);
  }
}