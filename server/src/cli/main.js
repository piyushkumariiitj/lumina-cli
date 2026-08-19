#!/usr/bin/env node
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { Command } from "commander";
import { login, logout, whoami } from "./commands/auth/login.js";
import { wakeUp } from "./commands/ai/wakeUp.js";
import { renderBanner, renderError } from "./ui/components.js";
import { theme } from "./ui/theme.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, "../../.env");

dotenv.config({ path: envPath, quiet: true });

async function main() {
  const program = new Command("lumina");

  program
    .version("1.0.0", "-v, --version", "Output current version of Lumina CLI")
    .description("Lumina CLI - Autonomous AI-Powered Software Engineering Agent")
    .helpOption("-h, --help", "Display help menu with available commands");

  // Custom help formatting
  program.configureHelp({
    subcommandDescription: (cmd) => theme.muted(cmd.description()),
    optionDescription: (opt) => theme.muted(opt.description),
    commandUsage: (cmd) =>
      theme.accent(`lumina`) + " " + theme.whiteBold(cmd.usage ? cmd.usage() : "<command> [options]"),
  });

  program.addCommand(wakeUp);
  program.addCommand(login);
  program.addCommand(logout);
  program.addCommand(whoami);

  program.on("--help", () => {
    console.log(theme.accentBold("\nQuick Start Guide:"));
    console.log(`  ${theme.tool("lumina wakeup")}     ${theme.muted("Interactive AI launcher (Chat, Tools, Agent)")}`);
    console.log(`  ${theme.tool("lumina login")}      ${theme.muted("Authenticate with GitHub account")}`);
    console.log(`  ${theme.tool("lumina whoami")}     ${theme.muted("Display current developer session")}`);
    console.log(`  ${theme.tool("lumina logout")}     ${theme.muted("End session and clear credentials")}\n`);
  });

  program.action(() => {
    renderBanner();
    program.help();
  });

  program.parse(process.argv);
}

main().catch((err) => {
  renderError("Failed to execute Lumina CLI", err.message);
  process.exit(1);
});