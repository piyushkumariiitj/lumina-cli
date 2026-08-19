import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, "../../.env");

dotenv.config({ path: envPath, quiet: true });

const connectionString = process.env.DATABASE_URL;

// Configure pg.Pool with keepAlive, idle timeouts, and connection lifecycle handlers
// to prevent "ConnectionClosed" drops on Neon Serverless PostgreSQL
const pool = new pg.Pool({
  connectionString,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  keepAlive: true,
  ssl: {
    rejectUnauthorized: false,
  },
});

// Gracefully handle idle client disconnects without throwing unhandled errors
pool.on("error", (err) => {
  // Silent recovery for idle background connection closures by Neon
});

const adapter = new PrismaPg(pool);

const globalForPrisma = global;
const prisma = globalForPrisma.prisma || new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;