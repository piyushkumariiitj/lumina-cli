import "dotenv/config";
import express from "express";
import { toNodeHandler, fromNodeHeaders } from "better-auth/node";
import cors from "cors";
import { auth } from "./lib/auth.js";

const app = express();

const CLIENT_URL = (process.env.CLIENT_URL || "https://luminacli.vercel.app").replace(/\/+$/, "");

// Configure CORS middleware supporting both local dev and production
const allowedOrigins = Array.from(
  new Set(["http://localhost:3000", "https://luminacli.vercel.app", CLIENT_URL].filter(Boolean))
);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like CLI, curl, or mobile) or if in allowed list
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);

app.all("/api/auth/*splat", toNodeHandler(auth));

app.use(express.json());

app.get("/", (req, res) => {
  res.redirect(CLIENT_URL);
});

app.get("/api/me", async (req, res) => {
 	const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
	return res.json(session);
});

app.get("/device", async (req, res) => {
	const { user_code } = req.query;
  res.redirect(`${CLIENT_URL}/device?user_code=${user_code || ""}`);
});

app.get("/health", (req, res) => {
  res.send("OK");
});

const PORT = process.env.PORT || 3005;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});