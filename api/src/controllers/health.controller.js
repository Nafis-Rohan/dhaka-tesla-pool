import { pool } from "../lib/db.js";

// GET /health — used by docker-compose healthchecks and by us, manually,
// to confirm the API can actually reach Postgres (not just that Express is up).
export async function getHealth(req, res) {
  try {
    await pool.query("SELECT 1");
    res.json({
      status: "ok",
      db: "up",
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error(err);
    res.status(503).json({
      error: { code: "DB_UNAVAILABLE", message: "Database connection failed", details: {} },
    });
  }
}
