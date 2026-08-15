import { Router } from 'express';
import { asyncHandler } from '../shared/async-handler.js';
import { validate } from '../shared/validate.js';
import { slugParamsSchema } from './restaurant.validation.js';

export function publicRestaurantRoutes(controller) {
  const router = Router();
  router.get('/:slug', validate(slugParamsSchema, 'params'), asyncHandler(controller.getPublic));
  return router;
}
