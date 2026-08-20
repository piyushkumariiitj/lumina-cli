import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export const CONFIG_DIR = path.join(os.homedir(), ".better-auth");
export const TOKEN_FILE = path.join(CONFIG_DIR, "token.json");

export async function getStoredToken() {
  try {
    const data = await fs.readFile(TOKEN_FILE, "utf-8");
    const token = JSON.parse(data);
    return token;
  } catch (error) {
    return null;
  }
}

export async function storeToken(token, user = null) {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true });

    const existing = await getStoredToken();
    const tokenData = {
      access_token: token.access_token,
      refresh_token: token.refresh_token || existing?.refresh_token,
      token_type: token.token_type || "Bearer",
      scope: token.scope || existing?.scope,
      expires_at: token.expires_in
        ? new Date(Date.now() + token.expires_in * 1000).toISOString()
        : token.expires_at || existing?.expires_at,
      created_at: existing?.created_at || new Date().toISOString(),
      user: user || token.user || existing?.user || { name: "Developer", email: "Authenticated Developer" },
      groq_api_key: token.groq_api_key || existing?.groq_api_key,
    };

    await fs.writeFile(TOKEN_FILE, JSON.stringify(tokenData, null, 2), "utf-8");
    return true;
  } catch (error) {
    return false;
  }
}

export async function getStoredApiKey() {
  try {
    const token = await getStoredToken();
    return token?.groq_api_key || null;
  } catch {
    return null;
  }
}

export async function storeApiKey(apiKey) {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    let existing = await getStoredToken() || {};
    existing.groq_api_key = apiKey;
    await fs.writeFile(TOKEN_FILE, JSON.stringify(existing, null, 2), "utf-8");
    return true;
  } catch {
    return false;
  }
}

export async function updateStoredUser(user) {
  try {
    const token = await getStoredToken();
    if (token) {
      token.user = user;
      await fs.writeFile(TOKEN_FILE, JSON.stringify(token, null, 2), "utf-8");
    }
  } catch {
    // Ignore update failures
  }
}

export async function clearStoredToken() {
  try {
    await fs.unlink(TOKEN_FILE);
    return true;
  } catch (error) {
    return false;
  }
}

export async function isTokenExpired() {
  const token = await getStoredToken();
  if (!token || !token.expires_at) {
    return true;
  }

  const expiresAt = new Date(token.expires_at);
  const now = new Date();

  return expiresAt.getTime() - now.getTime() < 5 * 60 * 1000;
}

export async function requireAuth() {
  const token = await getStoredToken();
  if (!token) {
    process.exit(1);
  }
  return token;
}