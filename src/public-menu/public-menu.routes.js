import { Router } from 'express';

import { createRateLimiter } from '../core/middleware/rate-limit.js';
import { asyncHandler } from '../shared/async-handler.js';
import { validate } from '../shared/validate.js';
import { publicMenuQuerySchema, qrParamsSchema } from './public-menu.validation.js';

export const createPublicMenuLimiter = (options = {}) =>
  createRateLimiter({ limit: 120, ...options });

export function createPublicMenuRouter({ controller, limiter = createPublicMenuLimiter() }) {
  const router = Router();
  router.get(
    '/:qrToken',
    limiter,
    validate(qrParamsSchema, 'params'),
    validate(publicMenuQuerySchema, 'query'),
    asyncHandler(controller.get),
  );
  return router;
}
