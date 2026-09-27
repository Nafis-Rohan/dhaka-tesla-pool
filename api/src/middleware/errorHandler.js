import { AppError } from "../lib/AppError.js";
import { logger } from "../lib/logger.js";

// Central error middleware (the Express equivalent of @ControllerAdvice).
// Every route/service throws AppError for expected failures; anything else
// (a bug, a driver crash) is logged in full but never leaks its message/stack
// to the client.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const log = req.log ?? logger;

  if (err instanceof AppError) {
    log.warn({ code: err.code, details: err.details }, err.message);
    return res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
  }

  log.error({ err }, "unhandled error");
  return res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Something went wrong", details: {} },
  });
}
