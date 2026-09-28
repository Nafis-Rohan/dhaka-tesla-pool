import jwt from 'jsonwebtoken';
import { env } from './env.js';
import { AppError } from './AppError.js';

// The token carries only who the user is (sub = user id) and their role.
// Anything else (name, phone) is looked up fresh from the DB when needed.
export function signToken(user) {
  return jwt.sign({ role: user.role }, env.jwtSecret, {
    subject: user.id,
    expiresIn: env.jwtExpiresIn,
    algorithm: 'HS256',
  });
}

// Pinning `algorithms` stops a forged token from choosing its own (e.g. "none").
// Any failure (bad signature, expired, malformed) becomes the same 401 so we don't leak why.
export function verifyToken(token) {
  try {
    return jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
  } catch {
    throw new AppError('UNAUTHENTICATED', 401, 'Invalid or expired token');
  }
}
