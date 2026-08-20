import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { Command } from "commander";
import yoctoSpinner from "yocto-spinner";
import { getStoredToken, updateStoredUser } from "../../../lib/token.js";
import { resolveServerUrl } from "../../../lib/server-url.js";
import prisma from "../../../lib/db.js";
import { select, isCancel } from "@clack/prompts";
import { startChat } from "../../chat/chat-with-ai.js";
import { startToolChat } from "../../chat/chat-with-ai-tool.js";
import { startAgentChat } from "../../chat/chat-with-ai-agent.js";
import { renderBanner, renderUserCard, renderGoodbye, renderError } from "../../ui/components.js";
import { whoamiAction } from "../auth/login.js";
import { theme } from "../../ui/theme.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, "../../../.env");

dotenv.config({ path: envPath, quiet: true });

export const wakeUpAction = async () => {
  renderBanner();

  const token = await getStoredToken();

  if (!token?.access_token) {
    console.log(theme.warning("💡 You are currently not signed in."));
    console.log(theme.muted("   Run ") + theme.accentBold("lumina login") + theme.muted(" to authenticate with GitHub.\n"));
    return;
  }

  const spinner = yoctoSpinner({
    text: theme.muted("Synchronizing developer profile..."),
    color: "yellow",
  }).start();

  let user = token.user || null;

  // 1. Try HTTP API (fast 600ms timeout)
  if (!user?.name || user.name === "Developer") {
    try {
      const serverUrl = await resolveServerUrl();
      const response = await fetch(`${serverUrl}/api/me`, {
        headers: {
          Authorization: `Bearer ${token.access_token}`,
          Cookie: `better-auth.session_token=${token.access_token}`,
        },
        signal: AbortSignal.timeout(600),
      });
      if (response.ok) {
        const data = await response.json();
        if (data?.user) {
          user = data.user;
          await updateStoredUser(user);
        }
      }
    } catch {
      // Backend offline or timeout
    }
  }

  // 2. Try direct Prisma DB query with timeout if not found via API
  if (!user?.name || user.name === "Developer") {
    try {
      const dbUser = await Promise.race([
        prisma.user.findFirst({
          where: {
            sessions: {
              some: { token: token.access_token },
            },
          },
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 1200)),
      ]);
      if (dbUser) {
        user = dbUser;
        await updateStoredUser(user);
      }
    } catch {
      // DB connection offline/slow
    }
  }

  spinner.stop();

  // If no user object, create clean fallback with token slice
  if (!user) {
    user = {
      id: token.access_token.slice(0, 12),
      name: "Developer",
      email: "local@lumina",
    };
  }

  // Render clean user overview card
  renderUserCard(user);

  const choice = await select({
    message: "Select capability:",
    options: [
      {
        value: "chat",
        label: "💬 Chat",
        hint: "Conversational AI with memory and code formatting",
      },
      {
        value: "tool",
        label: "⚡ Tools",
        hint: "Live web search, code execution, git, workspace reader",
      },
      {
        value: "agent",
        label: "🤖 Agent",
        hint: "Autonomous project architect & code generator",
      },
      {
        value: "whoami",
        label: "⚙  Status & Diagnostics",
        hint: "Inspect profile, Groq model, and database connection",
      },
      {
        value: "exit",
        label: "🚪 Exit",
      },
    ],
  });

  if (isCancel(choice) || choice === "exit") {
    renderGoodbye();
    return;
  }

  switch (choice) {
    case "chat":
      await startChat("chat");
      break;
    case "tool":
      await startToolChat();
      break;
    case "agent":
      await startAgentChat();
      break;
    case "whoami":
      await whoamiAction();
      break;
  }
};

export const wakeUp = new Command("wakeup")
  .description("Launch the interactive Lumina AI environment")
  .action(wakeUpAction);