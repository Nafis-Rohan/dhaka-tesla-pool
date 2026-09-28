import { rateLimit } from 'express-rate-limit';
import { AppError } from '../lib/AppError.js';
import { env } from '../lib/env.js';

// Slows down password guessing and sign-up spam: 20 requests per IP per 15 minutes on /auth/*.
// Counters live in memory, which is fine for one API instance (see "scaling" notes).
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,

  skip: () => env.nodeEnv === 'test',

  handler: (req, res, next) =>
    next(new AppError('RATE_LIMITED', 429, 'Too many attempts, please try again later')),
});
