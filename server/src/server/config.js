const trimSlash = (url) => url.replace(/\/+$/, "");

const positive = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/**
 * All server settings, read once from the environment. Kept separate from the
 * Express app so tests can build an app with explicit values.
 */
export function loadServerConfig(env = process.env) {
  const clientUrl = trimSlash(env.CLIENT_URL || "https://luminacli.vercel.app");
  const extraOrigins = (env.CORS_ORIGINS || "")
    .split(",")
    .map((o) => trimSlash(o.trim()))
    .filter(Boolean);

  const model = env.LUMINA_MODEL || "openai/gpt-oss-120b";
  const fallbackModel = env.LUMINA_FALLBACK_MODEL || "openai/gpt-oss-20b";

  return {
    port: positive(env.PORT, 3005),
    clientUrl,
    allowedOrigins: [...new Set(["http://localhost:3000", "https://luminacli.vercel.app", clientUrl, ...extraOrigins])],
    model,
    fallbackModel,
    groqApiKey: (env.GROQ_API_KEY || "").trim(),
    groqBaseUrl: trimSlash(env.GROQ_BASE_URL || "https://api.groq.com/openai/v1"),
    // Old CLIs (<= 1.0.10) expect /api/ai/config to return the provider key. Off by default.
    legacyKeyHandout: env.LUMINA_LEGACY_KEY_HANDOUT === "true",
    proxy: {
      allowedModels: [...new Set([model, fallbackModel])],
      requestsPerMinute: positive(env.LUMINA_PROXY_RPM, 30),
      maxConcurrent: positive(env.LUMINA_PROXY_CONCURRENCY, 4),
      maxOutputTokens: positive(env.LUMINA_PROXY_MAX_OUTPUT_TOKENS, 16384),
      timeoutMs: positive(env.LUMINA_PROXY_TIMEOUT_MS, 120_000),
      maxBodyBytes: positive(env.LUMINA_PROXY_MAX_BODY_BYTES, 2 * 1024 * 1024),
    },
  };
}
