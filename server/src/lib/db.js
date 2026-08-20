import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, "../../.env");

dotenv.config({ path: envPath, quiet: true });

const connectionString = process.env.DATABASE_URL;

let prisma = null;

if (connectionString) {
  try {
    const { PrismaClient } = await import("@prisma/client");
    const { PrismaPg } = await import("@prisma/adapter-pg");
    const { default: pg } = await import("pg");

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

    pool.on("error", () => {});

    const adapter = new PrismaPg(pool);
    prisma = new PrismaClient({ adapter });
  } catch {
    // Database adapter initialization failed or Prisma client not generated
  }
}

// Fallback proxy so calling prisma operations never crashes the CLI in offline/client mode
if (!prisma) {
  const fallbackHandler = {
    get() {
      return new Proxy(() => Promise.resolve(null), fallbackHandler);
    },
    apply() {
      return Promise.resolve(null);
    },
  };
  prisma = new Proxy({}, fallbackHandler);
}

export default prisma;