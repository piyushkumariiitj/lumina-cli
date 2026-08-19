import dotenv from 'dotenv';
dotenv.config();

export const config = {
  groqApiKey: process.env.GROQ_API_KEY || process.env.GROQ_KEY || '',
  model: process.env.LUMINA_MODEL || process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
  fallbackModel: process.env.LUMINA_FALLBACK_MODEL || 'qwen/qwen3.6-27b',
};
