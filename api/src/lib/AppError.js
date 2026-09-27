export class AppError extends Error {
  constructor(code, status, message, details = {}) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}
