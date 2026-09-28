import { AppError } from '../lib/AppError.js';

// Usage (always after requireAuth): router.use(requireAuth, requireRole('DRIVER'))
// 401 = "who are you?" (requireAuth), 403 = "you're known, but not allowed" (this).
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      throw new AppError('FORBIDDEN', 403, 'You do not have access to this resource');
    }
    next();
  };
}
