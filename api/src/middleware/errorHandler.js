import { AppError } from '../lib/AppError.js';

export function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    req.log?.warn({ err }, err.message);
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
  }

  req.log?.error({ err }, 'unhandled error');
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong', details: {} },
  });
}
