import { randomUUID } from "node:crypto";

// Lets a caller pass their own X-Request-Id (useful when the frontend logs it
// too), otherwise generates one. Echoed back so it can be matched in support/bug reports.
export function requestId(req, res, next) {
  req.id = req.headers["x-request-id"] || randomUUID();
  res.setHeader("X-Request-Id", req.id);
  next();
}
