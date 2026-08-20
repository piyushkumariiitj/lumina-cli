import "dotenv/config";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import prisma from "./db.js";
import { deviceAuthorization } from "better-auth/plugins";

const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3000";

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3005",
  basePath: "/api/auth",
  trustedOrigins: Array.from(new Set(["http://localhost:3000", CLIENT_URL].filter(Boolean))),
 plugins: [
    deviceAuthorization({ 
      verificationUri: `${CLIENT_URL}/device`, 
    }), 
  ],
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      
    },
  
  },

    logger: {
        level: "debug"
    }
});