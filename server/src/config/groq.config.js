import dotenv from 'dotenv';
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, "../../.env");
const rootEnvPath = path.resolve(__dirname, "../../../.env");

dotenv.config({ path: envPath, quiet: true });
dotenv.config({ path: rootEnvPath, quiet: true });
dotenv.config({ quiet: true });

export const config = {
  get groqApiKey() {
    return process.env.GROQ_API_KEY || process.env.GROQ_KEY || '';
  },
  get model() {
    return process.env.LUMINA_MODEL || process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
  },
  get fallbackModel() {
    return process.env.LUMINA_FALLBACK_MODEL || 'openai/gpt-oss-20b';
  },
};
