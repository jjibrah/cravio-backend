import { AppError } from './errors.js';
import { logger as defaultLogger } from '../core/logging/logger.js';

export const notFoundHandler = (_req, _res, next) => next(new AppError(404, 'ROUTE_NOT_FOUND', 'Route not found'));
export const createErrorHandler = (log = defaultLogger) => (error, req, res, _next) => {
  if (error instanceof AppError) { if (error.status >= 500) log.error(error.message, { request_id: req.id, code: error.code }); const body = { success: false, error: { code: error.code, message: error.message } }; if (error.details) body.error.details = error.details; return res.status(error.status).json(body); }
  if (error?.type === 'entity.too.large') return res.status(413).json({ success: false, error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' } });
  log.error('Unexpected request failure', { request_id: req.id, error: error?.message });
  return res.status(500).json({ success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred' } });
};
export const errorHandler = createErrorHandler();
