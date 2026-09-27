import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

// Load the repo-root .env regardless of which folder `npm run dev` is
// invoked from. api/src/lib -> api/src -> api -> repo root (3 levels up).
// dotenv never overwrites a variable already set in process.env, so real
// hosting envs (Render, etc.) always win over this file.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  // comma-separated list of allowed browser origins, e.g. "http://localhost:5173,https://app.example.com"
  CORS_ORIGIN: z.string().min(1, "CORS_ORIGIN is required"),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

export const corsAllowlist = env.CORS_ORIGIN.split(",").map((origin) => origin.trim());
