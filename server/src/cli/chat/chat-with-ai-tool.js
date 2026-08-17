import chalk from "chalk";
import { startChat } from "./chat-with-ai.js";

export async function startToolChat(conversationId = null) {
  console.log(chalk.bold.yellow("\n🔧 Tool Calling Mode"));
  console.log(chalk.gray("Interacting with tools (Google Search & Code Execution)\n"));
  await startChat("tool", conversationId);
}
