import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { asyncHandler } from '../shared/async-handler.js';
import { validate } from '../shared/validate.js';
import { publicMenuQuerySchema, qrParamsSchema } from './public-menu.validation.js';

export const createPublicMenuLimiter = (options = {}) => rateLimit({
  windowMs: 60_000,
  limit: 120,
  ...options,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests' } })
});

export function createPublicMenuRouter({ controller, limiter = createPublicMenuLimiter() }) {
  const router = Router();
  router.get('/:qrToken', limiter, validate(qrParamsSchema, 'params'), validate(publicMenuQuerySchema, 'query'), asyncHandler(controller.get));
  return router;
}
