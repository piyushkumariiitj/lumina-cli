import "dotenv/config";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import prisma from "./db.js";
import { bearer, deviceAuthorization } from "better-auth/plugins";

const CLIENT_URL = (process.env.CLIENT_URL || "https://luminacli.vercel.app").replace(/\/+$/, "");

// Fail closed: a missing secret used to fall back to a string published in this repo,
// which would let anyone forge session cookies.
if (!process.env.BETTER_AUTH_SECRET?.trim()) {
  throw new Error("BETTER_AUTH_SECRET is not set. Generate one with: openssl rand -base64 32");
}

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
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
    // The CLI authenticates with `Authorization: Bearer <session token>` from the device flow.
    // Without this plugin Better Auth ignores that header and every CLI request is anonymous.
    bearer(),
  ],
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID || "Ov23lic0GmWqY0cYavso",
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    },
  },
});
