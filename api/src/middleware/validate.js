import { AppError } from '../lib/AppError.js';

// Usage: router.post('/register', validate(registerSchema), controller.register)
//        router.get('/:id', validate(idSchema, 'params'), controller.get)
// `source` is 'body' (default), 'query' or 'params'.
// Body: req.body is replaced with the parsed data, so unknown fields (e.g. "role") are stripped.
// Query/params: Express 5 makes req.query read-only, so parsed values go to req.valid.query / req.valid.params.
export function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const fields = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join('.') || '_';
        fields[key] ??= issue.message; // keep the first message per field
      }
      throw new AppError('VALIDATION_ERROR', 400, 'Invalid request data', { fields });
    }
    if (source === 'body') req.body = result.data;
    else req.valid = { ...req.valid, [source]: result.data };
    next();
  };
}
