import express from "express";
import helmet from "helmet";
import cors from "cors";
import { corsAllowlist } from "./lib/env.js";
import { router } from "./routes/index.js";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        // `origin` is undefined for same-origin/non-browser requests (curl, health checks)
        if (!origin || corsAllowlist.includes(origin)) return callback(null, true);
        return callback(new Error("Not allowed by CORS"));
      },
      credentials: false, // auth is a JWT bearer header, not a cookie — no cross-site cookie issue to solve
    })
  );
  app.use(express.json({ limit: "100kb" }));

  app.use(router);

  // TODO(next commit): centralized AppError-aware error middleware + request logging
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong", details: {} } });
  });

  return app;
}
