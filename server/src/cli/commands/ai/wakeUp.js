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

  const user = await prisma.user.findFirst({
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