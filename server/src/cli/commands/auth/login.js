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
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import prisma from "../../../lib/db.js";
import { CONFIG_DIR, TOKEN_FILE, getStoredToken, isTokenExpired, storeToken, clearStoredToken, requireAuth } from "../../../lib/token.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, "../../../.env");

dotenv.config({ path: envPath, quiet: true });

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
            let userDisplayName = "User";
            try {
                const { data: session } = await authClient.getSession({
                    fetchOptions: {
                        headers: {
                            Authorization: `Bearer ${token.access_token}`,
                        },
                    },
                });
                if (session?.user) {
                    userDisplayName = session.user.name || session.user.email || "User";
                }
            } catch {
                // Fallback if session fetch fails
            }

            outro(
                chalk.green(
                    `✅ Login successful! Welcome ${userDisplayName}`
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
// ============================================
// LOGOUT COMMAND
// ============================================

export async function logoutAction() {
    intro(chalk.bold("👋 Logout"));

    const token = await getStoredToken();

    if (!token) {
        console.log(chalk.yellow("You're not logged in."));
        process.exit(0);
    }

    const shouldLogout = await confirm({
        message: "Are you sure you want to logout?",
        initialValue: false,
    });

    if (isCancel(shouldLogout) || !shouldLogout) {
        cancel("Logout cancelled");
        process.exit(0);
    }

    const cleared = await clearStoredToken();

    if (cleared) {
        outro(chalk.green("✅ Successfully logged out!"));
    } else {
        console.log(chalk.yellow("⚠️  Could not clear token file."));
    }
}

// ============================================
// WHOAMI COMMAND
// ============================================

export async function whoamiAction(opts) {
    const token = await getStoredToken();
    const expired = await isTokenExpired();

    if (!token || !token.access_token || expired) {
        console.log(chalk.yellow("\n💡 You are currently logged out."));
        console.log(chalk.gray("   Run: lumina login to sign in.\n"));
        process.exit(0);
    }

    let user = null;

    // 1. Try to fetch session from Auth Server via HTTP API (fast 500ms timeout)
    try {
        const serverUrl = opts?.serverUrl || URL;
        let response = await fetch(`${serverUrl}/api/me`, {
            headers: {
                Authorization: `Bearer ${token.access_token}`,
                Cookie: `better-auth.session_token=${token.access_token}`
            },
            signal: AbortSignal.timeout(500)
        });
        if (!response.ok) {
            response = await fetch(`${serverUrl}/api/auth/get-session`, {
                headers: {
                    Authorization: `Bearer ${token.access_token}`,
                    Cookie: `better-auth.session_token=${token.access_token}`
                },
                signal: AbortSignal.timeout(500)
            });
        }
        if (response.ok) {
            const data = await response.json();
            if (data?.user) {
                user = data.user;
            }
        }
    } catch {
        // Fast fallback if server is offline
    }

    // 2. Fallback to direct Prisma query if HTTP API didn't return user
    if (!user) {
        try {
            user = await prisma.user.findFirst({
                where: {
                    sessions: {
                        some: {
                            token: token.access_token,
                        },
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
            console.log(chalk.red("\n❌ Could not connect to backend server or database."));
            console.log(chalk.yellow("   Make sure your backend server (port 3005) and PostgreSQL database are running.\n"));
            process.exit(1);
        }
    }

    if (!user) {
        console.log(chalk.yellow("\n💡 You are currently logged out (session invalid or expired)."));
        console.log(chalk.gray("   Run: lumina login to sign in.\n"));
        process.exit(0);
    }

    // Output user session info
    console.log(
        chalk.bold.magentaBright(`\n👤 User: ${user.name || "N/A"}
📧 Email: ${user.email}
👤 ID: ${user.id}\n`)
    );

    process.exit(0);
}


// COMMANDER SETUP


export const login = new Command("login")
    .description("Login to Better Auth")
    .option("--server-url <url>", "Server URL", URL)
    .option("--client-id <id>", "The OAuth client ID", CLIENT_ID)
    .action(loginAction);
export const logout = new Command("logout")
    .description("Logout and clear stored credentials")
    .action(logoutAction);

export const whoami = new Command("whoami")
    .description("Show current authenticated user")
    .option("--server-url <url>", "The Better Auth server URL", URL)
    .action(whoamiAction);