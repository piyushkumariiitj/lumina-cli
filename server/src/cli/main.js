#!/usr/bin/env node
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import chalk from "chalk";
import figlet from "figlet";
import { Command } from "commander";
import { login, logout, whoami } from "./commands/auth/login.js";
import { wakeUp } from "./commands/ai/wakeUp.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, "../../.env");

dotenv.config({ path: envPath, quiet: true });

async function main() {
  // display banner
  console.log(
    chalk.cyan(
      figlet.textSync("Lumina CLI", {
        font: "Standard",
        horizontalLayout: "default",
      })
    )
  );

  console.log(chalk.red("A cli based AI Tool\n"));

  const program = new Command("Lumina");

  program
    .version("0.0.1")
    .description("Lumina CLI- An AI Powered Software Engineering Agent")
    .addCommand(login)
    .addCommand(logout)
    .addCommand(whoami)
    .addCommand(wakeUp);

  // default action show help
  program.action(() => {
    program.help();
  });
  program.parse();
}

main().catch((err) => {
  console.log(chalk.red("Error running Lumina CLI"), err);
  process.exit(1);
});