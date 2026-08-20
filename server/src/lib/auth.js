import "dotenv/config";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import prisma from "./db.js";
import { deviceAuthorization } from "better-auth/plugins";

const CLIENT_URL = (process.env.CLIENT_URL || "https://luminacli.vercel.app").replace(/\/+$/, "");

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET || "lumina_secret_key_prod_auth",
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  baseURL: process.env.BETTER_AUTH_URL || "https://lumina-cli.onrender.com",
  basePath: "/api/auth",
  trustedOrigins: Array.from(
    new Set([
      "http://localhost:3000",
      "http://localhost:3005",
      "https://luminacli.vercel.app",
      "https://lumina-cli.onrender.com",
      CLIENT_URL,
    ].filter(Boolean))
  ),
  advanced: {
    useSecureCookies: process.env.NODE_ENV === "production",
    defaultCookieAttributes: {
      sameSite: "none",
      secure: true,
    },
  },
  plugins: [
    deviceAuthorization({ 
      verificationUri: `${CLIENT_URL}/device`, 
    }), 
  ],
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID || "Ov23lic0GmWqY0cYavso",
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    },
  },
});