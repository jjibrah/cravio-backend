import { Router } from 'express';
import { asyncHandler } from '../shared/async-handler.js';
import { validate } from '../shared/validate.js';
import { requireActiveAccount, requireRole } from '../auth/auth.middleware.js';
import {
  createCategorySchema, updateCategorySchema, reorderCategoriesSchema, createMenuItemSchema,
  updateMenuItemSchema, updateAvailabilitySchema, reorderItemsSchema, menuItemQuerySchema, idParamsSchema
} from './menu.validation.js';

export function createMenuRouter({ auth, controller }) {
  const router = Router();
  router.use(auth, requireActiveAccount, requireRole('owner'));

  router.post('/categories/reorder', validate(reorderCategoriesSchema), asyncHandler(controller.reorderCategories));
  router.post('/categories', validate(createCategorySchema), asyncHandler(controller.createCategory));
  router.get('/categories', asyncHandler(controller.listCategories));
  router.get('/categories/:id', validate(idParamsSchema, 'params'), asyncHandler(controller.getCategory));
  router.patch('/categories/:id', validate(idParamsSchema, 'params'), validate(updateCategorySchema), asyncHandler(controller.updateCategory));
  router.delete('/categories/:id', validate(idParamsSchema, 'params'), asyncHandler(controller.deleteCategory));

  router.post('/items/reorder', validate(reorderItemsSchema), asyncHandler(controller.reorderItems));
  router.post('/items', validate(createMenuItemSchema), asyncHandler(controller.createItem));
  router.get('/items', validate(menuItemQuerySchema, 'query'), asyncHandler(controller.listItems));
  router.get('/items/:id', validate(idParamsSchema, 'params'), asyncHandler(controller.getItem));
  router.patch('/items/:id/availability', validate(idParamsSchema, 'params'), validate(updateAvailabilitySchema), asyncHandler(controller.setAvailability));
  router.patch('/items/:id', validate(idParamsSchema, 'params'), validate(updateMenuItemSchema), asyncHandler(controller.updateItem));
  router.delete('/items/:id', validate(idParamsSchema, 'params'), asyncHandler(controller.deleteItem));
  return router;
}
