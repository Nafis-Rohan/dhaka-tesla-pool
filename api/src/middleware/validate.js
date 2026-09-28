import { AppError } from '../lib/AppError.js';

// Usage: router.post('/register', validate(registerSchema), controller.register)
// On success req.body is replaced with the parsed data, so unknown fields (e.g. "role") are stripped.
export function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const fields = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join('.') || '_';
        fields[key] ??= issue.message; // keep the first message per field
      }
      throw new AppError('VALIDATION_ERROR', 400, 'Invalid request data', { fields });
    }
    req.body = result.data;
    next();
  };
}
