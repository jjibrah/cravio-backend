import { Router } from 'express';
import { asyncHandler } from '../shared/async-handler.js';
import { validate } from '../shared/validate.js';
import { requireActiveAccount, requireRole } from '../auth/auth.middleware.js';
import { idParamsSchema, listQuerySchema, statusSchema } from '../restaurant/restaurant.validation.js';

export function adminRestaurantRoutes(controller, requireAuth) {
  const router = Router();
  router.use(requireAuth, requireRole('admin'), requireActiveAccount);
  router.get('/', validate(listQuerySchema, 'query'), asyncHandler(controller.list));
  router.get('/:id', validate(idParamsSchema, 'params'), asyncHandler(controller.get));
  router.patch('/:id/status', validate(idParamsSchema, 'params'), validate(statusSchema), asyncHandler(controller.setStatus));
  return router;
}
