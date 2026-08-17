import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import chalk from "chalk";
import { Command } from "commander";
import yoctoSpinner from "yocto-spinner";
import { getStoredToken } from "../../../lib/token.js";
import prisma from "../../../lib/db.js";
import { select, isCancel } from "@clack/prompts";
import { startChat } from "../../chat/chat-with-ai.js";
import { startToolChat } from "../../chat/chat-with-ai-tool.js";
import { startAgentChat } from "../../chat/chat-with-ai-agent.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, "../../../../.env");

dotenv.config({ path: envPath, quiet: true });

const URL = process.env.BETTER_AUTH_URL || "http://localhost:3005";

const wakeUpAction = async () => {
  const token = await getStoredToken();

  if (!token?.access_token) {
    console.log(chalk.yellow("\n💡 You are currently logged out."));
    console.log(chalk.gray("   Run: lumina login to sign in.\n"));
    return;
  }

  const spinner = yoctoSpinner({ text: "Fetching User Information..." });
  spinner.start();

  let user = null;

  // 1. Fast-path: Try HTTP API first with 500ms timeout
  try {
    const response = await fetch(`${URL}/api/me`, {
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        Cookie: `better-auth.session_token=${token.access_token}`
      },
      signal: AbortSignal.timeout(500)
    });
    if (response.ok) {
      const data = await response.json();
      if (data?.user) {
        user = data.user;
      }
    }
  } catch {
    // API server offline or fast timeout, fallback to Prisma DB query
  }

  // 2. Fallback: Query Prisma Database with graceful error catching
  if (!user) {
    try {
      user = await prisma.user.findFirst({
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
      });
    } catch (dbErr) {
      spinner.stop();
      console.log(chalk.red("\n❌ Could not connect to backend server or database."));
      console.log(chalk.yellow("   Make sure your backend server or internet database connection is active.\n"));
      return;
    }
  }

  spinner.stop();

  if (!user) {
    console.log(chalk.yellow("\n💡 Session expired or invalid. Please login again."));
    console.log(chalk.gray("   Run: lumina login\n"));
    return;
  }

  console.log(chalk.green(`\nWelcome back, ${user.name}!\n`));

  const choice = await select({
    message: "Select an Option:",
    options: [
      {
        value: "chat",
        label: "Chat",
        hint: "Simple chat with AI",
      },
      {
        value: "tool",
        label: "Tool Calling",
        hint: "Chat with tools (Google Search, Code Execution)",
      },
      {
        value: "agent",
        label: "Agentic Mode",
        hint: "Advanced AI agent (Coming soon)",
      },
    ],
  });

  if (isCancel(choice)) {
    console.log(chalk.gray("\nOperation cancelled.\n"));
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
  }
};

export const wakeUp = new Command("wakeup")
  .description("Wake up the AI")
  .action(wakeUpAction);