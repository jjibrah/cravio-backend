import { AppError } from './errors.js';

export const validate = (schema, source = 'body', code = 'INVALID_REQUEST') => (req, _res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) {
    return next(new AppError(400, code, 'Invalid request data', result.error.flatten()));
  }
  if (source === 'query') req.validatedQuery = result.data;
  else req[source] = result.data;
  next();
};
