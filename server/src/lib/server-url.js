const LOCAL_URL = "http://localhost:3005";
const DEFAULT_PROD_URL = (process.env.LUMINA_PROD_URL || process.env.LUMINA_SERVER_URL || "https://lumina-cli.onrender.com").replace(/\/+$/, "");

/**
 * Dynamically resolves the active server URL:
 * 1. Uses explicit `customUrl` if passed via CLI option (--server-url)
 * 2. Uses process.env.LUMINA_SERVER_URL or process.env.BETTER_AUTH_URL if set
 * 3. Checks if local dev server is running on http://localhost:3005 (fast 300ms health check)
 * 4. Fallback to production server URL for public npm users
 */
export async function resolveServerUrl(customUrl = null) {
  if (customUrl) return customUrl.replace(/\/+$/, "");
  if (process.env.LUMINA_SERVER_URL) return process.env.LUMINA_SERVER_URL.replace(/\/+$/, "");
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL.replace(/\/+$/, "");

  try {
    const res = await fetch(`${LOCAL_URL}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(300),
    });
    if (res.ok) {
      return LOCAL_URL;
    }
  } catch {
    // Local server not running, fallback to prod
  }

  return DEFAULT_PROD_URL;
}

