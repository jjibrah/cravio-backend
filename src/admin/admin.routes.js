import { Router } from 'express';
import { requireActiveAccount, requireRole } from '../auth/auth.middleware.js';
import { asyncHandler } from '../shared/async-handler.js';
import { validate } from '../shared/validate.js';
import { dashboardSchema, idParamsSchema, ownerListSchema, restaurantListSchema, roleSchema, statusSchema, userListSchema } from './admin.validation.js';

export function createAdminRouter({ auth, controller }) {
  const router = Router(); router.use(auth, requireActiveAccount, requireRole('admin'));
  router.get('/dashboard', validate(dashboardSchema, 'query'), asyncHandler(controller.dashboard));
  router.get('/restaurants', validate(restaurantListSchema, 'query'), asyncHandler(controller.listRestaurants));
  router.get('/restaurants/:id', validate(idParamsSchema, 'params'), asyncHandler(controller.getRestaurant));
  router.patch('/restaurants/:id/status', validate(idParamsSchema, 'params'), validate(statusSchema), asyncHandler(controller.setRestaurantStatus));
  router.get('/owners', validate(ownerListSchema, 'query'), asyncHandler(controller.listOwners));
  router.get('/owners/:id', validate(idParamsSchema, 'params'), asyncHandler(controller.getOwner));
  router.patch('/owners/:id/status', validate(idParamsSchema, 'params'), validate(statusSchema), asyncHandler(controller.setOwnerStatus));
  // Backward-compatible Auth & Users admin surface.
  router.get('/users', validate(userListSchema, 'query'), asyncHandler(controller.listUsers));
  router.get('/users/:id', validate(idParamsSchema, 'params'), asyncHandler(controller.getUser));
  router.patch('/users/:id/status', validate(idParamsSchema, 'params'), validate(statusSchema), asyncHandler(controller.setUserStatus));
  router.patch('/users/:id/role', validate(idParamsSchema, 'params'), validate(roleSchema), asyncHandler(controller.setUserRole));
  return router;
}
