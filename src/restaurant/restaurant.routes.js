import { Router } from 'express';
import { asyncHandler } from '../shared/async-handler.js';
import { validate } from '../shared/validate.js';
import { requireActiveAccount, requireRole } from '../auth/auth.middleware.js';
import { createRestaurantSchema, updateRestaurantSchema } from './restaurant.validation.js';

export function restaurantRoutes(controller, requireAuth) {
  const router = Router();
  router.use(requireAuth, requireRole('owner'), requireActiveAccount);
  router.post('/', validate(createRestaurantSchema), asyncHandler(controller.create));
  router.get('/me', asyncHandler(controller.getMine));
  router.patch('/me', validate(updateRestaurantSchema), asyncHandler(controller.updateMine));
  router.post('/me/publish', asyncHandler(controller.publish));
  router.post('/me/unpublish', asyncHandler(controller.unpublish));
  return router;
}
