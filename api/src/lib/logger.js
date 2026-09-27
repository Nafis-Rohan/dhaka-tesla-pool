import pino from "pino";
import { env } from "./env.js";

// One shared logger instance. Structured JSON in production so it can be
// shipped/queried; readable via `npm run dev | npx pino-pretty` locally if wanted.
export const logger = pino({
  level: env.NODE_ENV === "production" ? "info" : "debug",
});
