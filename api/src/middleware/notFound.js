import { AppError } from "../lib/AppError.js";

// Falls through to here when no route matched. Kept as an AppError so it
// goes through the same response shape as every other error.
export function notFound(req, res, next) {
  next(new AppError("NOT_FOUND", 404, `No route for ${req.method} ${req.originalUrl}`));
}
