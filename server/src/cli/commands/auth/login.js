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
import { CONFIG_DIR, TOKEN_FILE, getStoredToken, isTokenExpired, storeToken } from "../../../lib/token.js";

dotenv.config();

const URL = process.env.BETTER_AUTH_URL || "http://localhost:3005";
const CLIENT_ID = process.env.GITHUB_CLIENT_ID || "Ov23lic0GmWqY0cYavso";

// LOGIN COMMAND
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

    const existingToken = await getStoredToken();
    const expired = await isTokenExpired();
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
                    `Failed to request device authorization: ${error?.error_description || error?.message || "Unknown error"}`
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
            verification_uri_complete,
            verification_uri,
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

        const token = await pollForToken(
            authClient,
            device_code,
            clientId,
            interval
        );
        if (token) {
            // Store the token
            const saved = await storeToken(token);

            if (!saved) {
                console.log(
                    chalk.yellow("\n⚠️  Warning: Could not save authentication token.")
                );
                console.log(
                    chalk.yellow("   You may need to login again on next use.")
                );
            }

            // Get user info
            // const { data: session } = await authClient.getSession({
            //     fetchOptions: {
            //         headers: {
            //             Authorization: `Bearer ${token.access_token}`,
            //         },
            //     },
            // });

            outro(
                chalk.green(
                    `✅ Login successful! Welcome ${session?.user?.name || session?.user?.email || "User"
                    }`
                )
            );

            console.log(chalk.gray(`\n📁 Token saved to: ${TOKEN_FILE}`));
            console.log(
                chalk.gray("You can now use AI commands without logging in again.\n")
            );
        }
    } catch (err) {
        if (spinner) spinner.stop();
        console.error(chalk.red("\nLogin failed:"), err.message || err);
        process.exit(1);
    }
}


async function pollForToken(authClient, device_code, clientId, initialInterval = 5) {
    let pollingInterval = Number(initialInterval) || 5;
    const spinner = yoctoSpinner({ text: "Polling for authorization...", color: "cyan" });
    spinner.start();
    let dots = 0;

    return new Promise((resolve, reject) => {
        const poll = async () => {
            dots = (dots + 1) % 4;
            spinner.text = chalk.gray(
                `Polling for authorization${".".repeat(dots)}${" ".repeat(3 - dots)}`
            );
            try {
                const { data, error } = await authClient.device.token({
                    grant_type: "urn:ietf:params:oauth:grant-type:device_code",
                    device_code: device_code,
                    client_id: clientId,
                    fetchOptions: {
                        headers: {
                            "user-agent": `Better Auth CLI`,
                        },
                    },
                });

                if (data?.access_token || data?.token) {
                    spinner.stop();
                    console.log(
                        chalk.bold.yellow(`\nYour access token: ${data?.access_token || data?.token}`)
                    );
                    resolve(data);
                    return;
                } else if (error) {
                    const errCode = error.error || error.message || error.code || "";
                    const errDesc = error.error_description || error.message || "";

                    if (
                        errCode === "authorization_pending" ||
                        errDesc.includes("pending") ||
                        (error.status === 400 && (typeof errDesc === "string" && errDesc.toLowerCase().includes("pending")))
                    ) {
                        // Still waiting for user authorization in browser, keep polling
                    } else if (errCode === "slow_down") {
                        pollingInterval += 5;
                    } else if (errCode === "access_denied") {
                        spinner.stop();
                        console.error(chalk.red("\nAccess was denied by the user."));
                        process.exit(1);
                    } else if (errCode === "expired_token") {
                        spinner.stop();
                        console.error(chalk.red("\nThe device code has expired. Please try again."));
                        process.exit(1);
                    } else {
                        spinner.stop();
                        console.error(chalk.red(`\nError: ${errDesc || errCode || JSON.stringify(error)}`));
                        process.exit(1);
                    }
                }
            } catch (err) {
                spinner.stop();
                console.error(chalk.red(`\nNetwork error: ${err.message}`));
                process.exit(1);
            }

            setTimeout(poll, pollingInterval * 1000);
        };

        setTimeout(poll, pollingInterval * 1000);
    });
}



// COMMANDER SETUP


export const login = new Command("login")
    .description("Login to Better Auth")
    .option("--server-url <url>", "Server URL", URL)
    .option("--client-id <id>", "The OAuth client ID", CLIENT_ID)
    .action(loginAction);
