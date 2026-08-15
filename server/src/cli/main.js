#!/usr/bin/env node
import dotenv from "dotenv";
import chalk from "chalk";
import figlet from "figlet";
import { Command } from "commander";
import { login } from "./commands/auth/login.js";

dotenv.config();

async function main() {
  // display banner
  console.log(
    chalk.cyan(
        figlet.textSync("Lumina CLI", {
            font:"Standard",
            horizontalLayout:"default"
        })
    )
  );

  console.log(chalk.blue("AI Powered Software Engineering Agent \n"));

  const program=new Command("Lumina");

  program.version("0.0.1")
  .description("Lumina CLI- An AI Powered Software Engineering Agent")
  .addCommand(login);

  // default action show help
  program.action(()=>{
    program.help();
  });
  program.parse()
}

main().catch((err)=>{
  console.log(chalk.red("Error running Lumina CLI"),err);
  process.exit(1);
});