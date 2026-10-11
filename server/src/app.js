import express from "express";
import cors from "cors";
import { toNodeHandler } from "better-auth/node";
import { createChatCompletionsProxy, openAiError } from "./server/ai-proxy.js";

export const AI_PROXY_PATH = "/api/ai/proxy/v1";

/**
 * Resolves the session for CLI requests from the Authorization header only.
 * Cookies are ignored here on purpose: a custom header can't be attached by a
 * cross-site form or simple request, so these routes are not CSRF-able.
 */
export function createBearerSessionResolver(auth) {
  return async function getBearerSession(req) {
    const authorization = req.headers.authorization;
    if (!authorization || !/^bearer\s+\S+/i.test(authorization)) return null;
    try {
      return await auth.api.getSession({ headers: new Headers({ authorization }) });
    } catch {
      return null;
    }
  };
}

export function createApp({ auth, config, fetchImpl = fetch, log = console }) {
  const app = express();
  app.disable("x-powered-by");

  const allowedOrigins = new Set(config.allowedOrigins);
  app.use(
    cors({
      // Requests without an Origin (CLI, curl) are allowed; browsers only from the allow-list.
      origin: (origin, callback) => callback(null, !origin || allowedOrigins.has(origin)),
      methods: ["GET", "POST", "PUT", "DELETE"],
      credentials: true,
    })
  );

  app.all("/api/auth/*splat", toNodeHandler(auth));

  app.use(express.json({ limit: config.proxy.maxBodyBytes }));

  const getBearerSession = createBearerSessionResolver(auth);

  app.get("/", (req, res) => res.redirect(config.clientUrl));

  app.get("/health", (req, res) => res.send("OK"));

  app.get("/api/me", async (req, res) => {
    const session = await getBearerSession(req);
    if (!session?.user) return res.status(401).json({ error: "Unauthorized. Please run 'lumina login' first." });
    // Never echo the session token back.
    return res.json({ user: session.user, session: { expiresAt: session.session?.expiresAt ?? null } });
  });

  app.get("/api/ai/config", async (req, res) => {
    const session = await getBearerSession(req);
    if (!session?.user) return res.status(401).json({ error: "Unauthorized. Please run 'lumina login' first." });
    return res.json({
      model: config.model,
      fallbackModel: config.fallbackModel,
      proxy: { path: AI_PROXY_PATH },
      ...(config.legacyKeyHandout ? { apiKey: config.groqApiKey } : {}),
    });
  });

  app.post(
    `${AI_PROXY_PATH}/chat/completions`,
    createChatCompletionsProxy({
      config,
      fetchImpl,
      log,
      getUserId: async (req) => (await getBearerSession(req))?.user?.id ?? null,
    })
  );

  app.get("/device", (req, res) => {
    const userCode = typeof req.query.user_code === "string" ? req.query.user_code : "";
    res.redirect(`${config.clientUrl}/device?user_code=${encodeURIComponent(userCode)}`);
  });

  // JSON body errors (malformed JSON, body too large) in an OpenAI-compatible shape.
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (err?.type === "entity.too.large") return openAiError(res, 413, "Request body too large.");
    if (err?.type === "entity.parse.failed") return openAiError(res, 400, "Malformed JSON body.");
    log.error?.("[server] unhandled error:", err?.message || err);
    return res.status(500).json({ error: { message: "Internal server error." } });
  });

  return app;
}
