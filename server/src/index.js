import "dotenv/config";
import { auth } from "./lib/auth.js";
import { createApp } from "./app.js";
import { loadServerConfig } from "./server/config.js";

const config = loadServerConfig(process.env);
const app = createApp({ auth, config });

if (!config.groqApiKey) {
  console.warn("[server] GROQ_API_KEY is not set: /api/ai/proxy will answer 503.");
}
if (config.legacyKeyHandout) {
  console.warn("[server] LUMINA_LEGACY_KEY_HANDOUT=true: /api/ai/config returns the provider key to signed-in users.");
}

const server = app.listen(config.port, () => {
  console.log(`Server is running on port ${config.port}`);
});

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 10_000).unref();
  });
}
