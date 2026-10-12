const LOCAL_URL = "http://localhost:3005";
const PROD_URL = "https://lumina-cli.onrender.com";

const trimSlash = (url) => url.trim().replace(/\/+$/, "");

async function isHealthy(url, timeoutMs = 500) {
  try {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Resolves which Lumina server the CLI talks to:
 * 1. `--server-url` (explicit; used as-is)
 * 2. LUMINA_SERVER_URL (explicit; used as-is)
 * 3. A local development server, but only if it answers /health: BETTER_AUTH_URL from a
 *    contributor's server/.env, then http://localhost:3005. BETTER_AUTH_URL is the server's own
 *    setting, so it must not be trusted blindly: when that server isn't running, fall through.
 * 4. Production (LUMINA_PROD_URL overrides the default)
 */
export async function resolveServerUrl(customUrl = null) {
  if (customUrl?.trim()) return trimSlash(customUrl);
  if (process.env.LUMINA_SERVER_URL?.trim()) return trimSlash(process.env.LUMINA_SERVER_URL);

  const localCandidates = [process.env.BETTER_AUTH_URL, LOCAL_URL].filter((u) => u?.trim()).map(trimSlash);
  for (const url of new Set(localCandidates)) {
    if (await isHealthy(url)) return url;
  }

  return trimSlash(process.env.LUMINA_PROD_URL || PROD_URL);
}
