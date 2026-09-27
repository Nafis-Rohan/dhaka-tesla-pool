import { pool } from "../lib/db.js";
import { AppError } from "../lib/AppError.js";

// GET /health — used by docker-compose healthchecks and by us, manually,
// to confirm the API can actually reach Postgres (not just that Express is up).
export async function getHealth(req, res, next) {
  try {
    await pool.query("SELECT 1");
    res.json({
      status: "ok",
      db: "up",
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    req.log?.error({ err }, "database health check failed");
    next(new AppError("DB_UNAVAILABLE", 503, "Database connection failed"));
  }
}
