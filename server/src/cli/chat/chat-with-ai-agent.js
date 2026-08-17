import chalk from "chalk";
import { startChat } from "./chat-with-ai.js";

export async function startAgentChat(conversationId = null) {
  console.log(chalk.bold.magenta("\n🧠 Agentic Mode"));
  console.log(chalk.gray("Autonomous AI Agent Mode\n"));
  await startChat("agent", conversationId);
}
