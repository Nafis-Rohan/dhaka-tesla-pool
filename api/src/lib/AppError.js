/**
 * Every business-logic failure (validation, not-found, capacity, invalid
 * transition, ...) throws one of these instead of a bare Error. The error
 * handler middleware knows how to turn it into the shared response shape:
 *   { "error": { "code": "...", "message": "...", "details": {} } }
 */
export class AppError extends Error {
  constructor(code, statusCode, message, details = {}) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}
