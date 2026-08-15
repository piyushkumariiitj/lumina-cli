import { cancel, confirm, intro, isCancel, outro } from "@clack/prompts";
// import logger from "better-auth";
import { createAuthClient } from "better-auth/client";
import { deviceAuthorizationClient } from "better-auth/client/plugins";

import chalk from "chalk";
import { Command } from "commander";
import fs from "node:fs/promises";
import open from "open";
import os from "os";
import path from "path";
import yoctoSpinner from "yocto-spinner";

import { z } from "zod";
import dotenv from "dotenv";
import prisma from "../../../lib/db.js";

dotenv.config();

const URL = process.env.BETTER_AUTH_URL || "http://localhost:3005";
const CLIENT_ID = process.env.GITHUB_CLIENT_ID || "Ov23lic0GmWqY0cYavso";
const CONFIG_DIR = path.join(os.homedir(), ".better-auth");
const TOKEN_FILE = path.join(CONFIG_DIR, "token.json");


export async function loginAction(opts) {
  const options = z
    .object({
      serverUrl: z.string().optional(),
      clientId: z.string().optional(),
    })
    .parse(opts);

  const serverUrl = options.serverUrl || URL;
  const clientId = options.clientId || CLIENT_ID;

  intro(chalk.bold("🔐 Lumina CLI Login"));

  // TODO: CHANGE THIS WITH TOKEN MANAGEMENT UTILS

  const existingToken = false;
  const expired = false;
  if (existingToken && !expired) {
    const shouldReAuth = await confirm({
      message: "You are already loggedIn, Do you want to login again?",
      initialValue: false
    });
    if (isCancel(shouldReAuth) || !shouldReAuth) {
      cancel(chalk.yellow("❌ Login cancelled"));
      process.exit(0);
    }
  }
  const authClient = createAuthClient({
    baseURL: serverUrl,
    plugins: [deviceAuthorizationClient()]
  });
  const spinner = yoctoSpinner({ text: "Requesting device authorization..." });
  spinner.start();

  try {
    // Request device code
    const { data, error } = await authClient.device.code({
      client_id: clientId,
      scope: "openid profile email",
    });

    spinner.stop();

    if (error || !data) {
      console.error(
        chalk.red(
          `Failed to request device authorization: ${
            error?.error_description || error?.message || "Unknown error"
          }`
        )
      );

      if (error?.status === 404) {
        console.log(chalk.red("\n❌ Device authorization endpoint not found."));
        console.log(chalk.yellow("   Make sure your auth server is running."));
      } else if (error?.status === 400) {
        console.log(
          chalk.red("\n❌ Bad request - check your CLIENT_ID configuration.")
        );
      }

      process.exit(1);
    }
    
    const {
      device_code,
      user_code,
      verification_uri,
      verification_uri_complete,
      interval = 5,
      expires_in,
    } = data;
    // Display authorization instructions
    console.log("");
    console.log(chalk.cyan("📱 Device Authorization Required"));
    console.log("");
    console.log(
      `Please visit: ${chalk.underline.blue(
        verification_uri_complete || verification_uri
      )}`
    );
    console.log(`Enter code: ${chalk.bold.green(user_code)}`);
    console.log("");

    // Ask if user wants to open browser
    const shouldOpen = await confirm({
      message: "Open browser automatically?",
      initialValue: true,
    });

    if (!isCancel(shouldOpen) && shouldOpen) {
      const urlToOpen = verification_uri_complete || verification_uri;
      await open(urlToOpen);
    }
    // Start polling
    console.log(
      chalk.gray(
        `Waiting for authorization (expires in ${Math.floor(
          expires_in / 60
        )} minutes)...`
      )
    );


  } catch (error) {
    spinner.stop();
    console.log(chalk.red("\n❌ Error connecting to authorization server:"));
    console.log(chalk.yellow(error.message || error));
    console.log(chalk.yellow(`   Make sure your server is running at ${serverUrl} (npm run dev in /server)`));
    process.exit(1);
  }
}

// ============================================
// COMMANDER SETUP
// ============================================

export const login = new Command("login")
  .description("Login to Better Auth")
  .option("--server-url <url>", "Server URL", URL)
  .option("--client-id <id>", "The OAuth client ID", CLIENT_ID)
  .action(loginAction);
