import { logger } from "../lib/logger.js";

// Attaches a per-request child logger (tagged with the request id) and logs
// one structured line per finished request: method, path, status, duration.
export function requestLogger(req, res, next) {
  const startedAt = Date.now();
  req.log = logger.child({ reqId: req.id });

  res.on("finish", () => {
    req.log.info(
      {
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        durationMs: Date.now() - startedAt,
      },
      "request completed"
    );
  });

  next();
}
