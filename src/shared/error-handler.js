import { AppError } from './errors.js';

export function notFoundHandler(_req, _res, next) {
  next(new AppError(404, 'NOT_FOUND', 'Route not found'));
}

export function errorHandler(error, _req, res, _next) {
  if (error instanceof AppError) {
    const body = { success: false, error: { code: error.code, message: error.message } };
    if (error.details) body.error.details = error.details;
    return res.status(error.status).json(body);
  }
  console.error(error);
  return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
}
