import dotenv from 'dotenv';
dotenv.config();

export const config = {
  googleApiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY || '',
  model: process.env.LUMINA_MODEL || 'gemini-3.7-flash',
};
