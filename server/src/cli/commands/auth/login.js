import { cancel, confirm, intro, isCancel } from "@clack/prompts";
import { createAuthClient } from "better-auth/client";
import { deviceAuthorizationClient } from "better-auth/client/plugins";
import { Command } from "commander";
import open from "open";
import yoctoSpinner from "yocto-spinner";
import { z } from "zod";
import { fileURLToPath } from "url";
import path from "path";
import dotenv from "dotenv";
import prisma from "../../../lib/db.js";
import { 
  CONFIG_DIR, 
  TOKEN_FILE, 
  getStoredToken, 
  isTokenExpired, 
  storeToken, 
  clearStoredToken, 
  updateStoredUser 
} from "../../../lib/token.js";
import { resolveServerUrl } from "../../../lib/server-url.js";
import { renderBanner, renderUserCard, renderGoodbye, renderError } from "../../ui/components.js";
import { theme } from "../../ui/theme.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, "../../../.env");

dotenv.config({ path: envPath, quiet: true });

const CLIENT_ID = process.env.GITHUB_CLIENT_ID || "Ov23lic0GmWqY0cYavso";

// ============================================
// LOGIN COMMAND
// ============================================
export async function loginAction(opts) {
  const options = z
    .object({
      serverUrl: z.string().optional(),
      clientId: z.string().optional(),
    })
    .parse(opts);

  const serverUrl = await resolveServerUrl(options.serverUrl);
  const clientId = options.clientId || CLIENT_ID;

  renderBanner();

  const existingToken = await getStoredToken();
  const expired = await isTokenExpired();
  if (existingToken && !expired) {
    const shouldReAuth = await confirm({
      message: "You already have an active session. Do you want to sign in again?",
      initialValue: false,
    });
    if (isCancel(shouldReAuth) || !shouldReAuth) {
      renderGoodbye("Existing session remains active.");
      process.exit(0);
    }
  }

  const authClient = createAuthClient({
    baseURL: serverUrl,
    plugins: [deviceAuthorizationClient()],
  });

  const spinner = yoctoSpinner({ text: "Requesting device code...", color: "yellow" });
  spinner.start();

  try {
    const { data, error } = await authClient.device.code({
      client_id: clientId,
      scope: "openid profile email",
    });

    spinner.stop();

    if (error || !data) {
      const errMsg = error?.error_description || error?.message || "Make sure auth server is running";
      renderError(
        "Failed to request device authorization code",
        `${errMsg}\n\n  Target Server URL: ${serverUrl}\n  Tip: Ensure the Lumina backend is running or specify a server URL via --server-url <URL>`
      );
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

    const authUrl = verification_uri_complete || verification_uri;

    console.log(`\n  ${theme.accentBold("Device Authorization:")}`);
    console.log(`  1. Visit:  ${theme.tool.underline(authUrl)}`);
    console.log(`  2. Code:   ${theme.userBold(user_code)}`);
    console.log(`  ${theme.muted(`(Expires in ${Math.floor(expires_in / 60)}m)`)}\n`);

    const shouldOpen = await confirm({
      message: "Open browser automatically?",
      initialValue: true,
    });

    if (!isCancel(shouldOpen) && shouldOpen) {
      await open(authUrl);
    }

    const token = await pollForToken(
      authClient,
      device_code,
      clientId,
      interval
    );

    if (token) {
      let userObj = { name: "Developer", email: "Active User" };
      try {
        const { data: session } = await authClient.getSession({
          fetchOptions: {
            headers: {
              Authorization: `Bearer ${token.access_token}`,
            },
          },
        });
        if (session?.user) {
          userObj = session.user;
        }
      } catch {
        // Fallback
      }

      await storeToken(token, userObj);
      console.log(`\n  ${theme.successBold("✔ Login successful!")} Welcome, ${userObj.name || "Developer"}.\n`);
    }
  } catch (err) {
    spinner.stop();
    const errText = String(err?.message || err).toLowerCase();
    const isFetchError = errText.includes("fetch failed") || errText.includes("econnrefused") || errText.includes("failed to fetch");
    
    if (isFetchError) {
      renderError(
        "Could not connect to Lumina Auth Server",
        `Failed to reach backend auth server at: ${serverUrl}\n\n` +
        `  Troubleshooting Steps:\n` +
        `  1. Ensure the Lumina backend Express server is running.\n` +
        `     Local Server: Start server by running 'node src/index.js' or 'npm run dev' inside server directory.\n` +
        `  2. If using a deployed server, specify the URL:\n` +
        `     lumina login --server-url <YOUR_BACKEND_URL>\n` +
        `  3. Or set environment variable:\n` +
        `     LUMINA_SERVER_URL=<YOUR_BACKEND_URL>`
      );
    } else {
      renderError("Login failed", err.message || String(err));
    }
    process.exit(1);
  }
}

async function pollForToken(authClient, device_code, clientId, initialInterval = 5) {
  let pollingInterval = Number(initialInterval) || 5;
  const spinner = yoctoSpinner({ text: "Waiting for browser authorization...", color: "yellow" });
  spinner.start();
  let dots = 0;

  return new Promise((resolve, reject) => {
    const poll = async () => {
      dots = (dots + 1) % 4;
      spinner.text = theme.muted(
        `Waiting for browser authorization${".".repeat(dots)}${" ".repeat(3 - dots)}`
      );
      try {
        const { data, error } = await authClient.device.token({
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
          device_code: device_code,
          client_id: clientId,
          fetchOptions: {
            headers: {
              "user-agent": `Lumina CLI`,
            },
          },
        });

        if (data?.access_token || data?.token) {
          spinner.stop();
          resolve(data);
          return;
        } else if (error) {
          const errCode = error.error || error.message || error.code || "";
          const errDesc = error.error_description || error.message || "";

          if (
            errCode === "authorization_pending" ||
            errDesc.includes("pending") ||
            (error.status === 400 && typeof errDesc === "string" && errDesc.toLowerCase().includes("pending"))
          ) {
            // Pending in browser, keep polling
          } else if (errCode === "slow_down") {
            pollingInterval += 5;
          } else if (errCode === "access_denied") {
            spinner.stop();
            renderError("Access was denied by the user.");
            process.exit(1);
          } else if (errCode === "expired_token") {
            spinner.stop();
            renderError("The device authorization code has expired. Please run 'lumina login' again.");
            process.exit(1);
          } else {
            spinner.stop();
            renderError(errDesc || errCode || "Authorization error");
            process.exit(1);
          }
        }
      } catch (err) {
        spinner.stop();
        renderError("Network error during token polling", err.message);
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
  const token = await getStoredToken();

  if (!token) {
    console.log(theme.warning("You are not currently logged in.\n"));
    process.exit(0);
  }

  const shouldLogout = await confirm({
    message: "Are you sure you want to end your session and logout?",
    initialValue: false,
  });

  if (isCancel(shouldLogout) || !shouldLogout) {
    renderGoodbye("Logout cancelled.");
    process.exit(0);
  }

  const cleared = await clearStoredToken();

  if (cleared) {
    renderGoodbye("Successfully logged out. See you next time!");
  } else {
    console.log(theme.warning("Could not clear token file.\n"));
  }
}

// ============================================
// WHOAMI COMMAND
// ============================================
export async function whoamiAction(opts) {
  const token = await getStoredToken();
  const expired = await isTokenExpired();

  if (!token || !token.access_token || expired) {
    renderBanner();
    console.log(theme.warning("💡 You are currently logged out."));
    console.log(theme.muted("   Run: ") + theme.accent("lumina login") + theme.muted(" to sign in.\n"));
    process.exit(0);
  }

  let user = token.user || null;

  // 1. Try to fetch session from Auth Server via HTTP API (fast 600ms timeout)
  if (!user?.name || user.name === "Developer") {
    try {
      const serverUrl = await resolveServerUrl(opts?.serverUrl);
      const response = await fetch(`${serverUrl}/api/me`, {
        headers: {
          Authorization: `Bearer ${token.access_token}`,
          Cookie: `better-auth.session_token=${token.access_token}`,
        },
        signal: AbortSignal.timeout(600),
      });
      if (response.ok) {
        const data = await response.json();
        if (data?.user) {
          user = data.user;
          await updateStoredUser(user);
        }
      }
    } catch {
      // Offline fallback
    }
  }

  // 2. Try direct Prisma query if not found
  if (!user?.name || user.name === "Developer") {
    try {
      const dbUser = await Promise.race([
        prisma.user.findFirst({
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
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 1200)),
      ]);
      if (dbUser) {
        user = dbUser;
        await updateStoredUser(user);
      }
    } catch {
      // Database offline/slow
    }
  }

  if (!user) {
    user = {
      id: token.access_token.slice(0, 12),
      name: "Developer",
      email: "local@lumina",
    };
  }

  renderBanner();
  renderUserCard(user);
  process.exit(0);
}

// COMMANDER SETUP
export const login = new Command("login")
  .description("Login to Lumina CLI with GitHub")
  .option("--server-url <url>", "Server URL", URL)
  .option("--client-id <id>", "The OAuth client ID", CLIENT_ID)
  .action(loginAction);

export const logout = new Command("logout")
  .description("Logout and clear stored credentials")
  .action(logoutAction);

export const whoami = new Command("whoami")
  .description("Show current authenticated developer profile")
  .option("--server-url <url>", "The Better Auth server URL", URL)
  .action(whoamiAction);