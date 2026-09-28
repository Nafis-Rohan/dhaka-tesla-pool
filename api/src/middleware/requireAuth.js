import { AppError } from '../lib/AppError.js';
import { verifyToken } from '../lib/jwt.js';

// Protects a route: expects "Authorization: Bearer <token>".
// On success sets req.user = { id, role } for later middleware and controllers.
// Trusts the token's claims and does NOT query the DB (stateless; see "no refresh tokens" trade-off).
export function requireAuth(req, res, next) {
  const [scheme, token] = (req.headers.authorization ?? '').split(' ');

  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    throw new AppError('UNAUTHENTICATED', 401, 'Missing or malformed Authorization header');
  }

  const payload = verifyToken(token); // throws 401 if invalid or expired
  req.user = { id: payload.sub, role: payload.role };
  next();
}
