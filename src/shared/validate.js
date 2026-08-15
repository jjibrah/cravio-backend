import { AppError } from './errors.js';

export const validate = (schema, source = 'body', code = 'INVALID_REQUEST') => (req, _res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({ field: issue.path.join('.') || source, message: issue.message }));
    return next(new AppError(400, code === 'INVALID_REQUEST' ? 'VALIDATION_ERROR' : code, 'Invalid request data', details));
  }
  if (source === 'query') req.validatedQuery = result.data;
  else req[source] = result.data;
  next();
};
