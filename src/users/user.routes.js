import { Router } from 'express';
import { asyncHandler } from '../shared/async-handler.js';
import { validate } from '../shared/validate.js';
import { requireActiveAccount, requireRole } from '../auth/auth.middleware.js';
import { idParamsSchema, listSchema, profileSchema, roleSchema, statusSchema } from './user.validation.js';

export function createUserRouter({ auth, controller }) {
  const router = Router();
  router.use(auth);
  router.get('/me', asyncHandler(controller.me));
  router.patch('/me', requireActiveAccount, validate(profileSchema), asyncHandler(controller.updateMe));
  return router;
}

export function createAdminUserRouter({ auth, controller }) {
  const router = Router();
  router.use(auth, requireRole('admin'), requireActiveAccount);
  router.get('/', validate(listSchema, 'query'), asyncHandler(controller.list));
  router.get('/:id', validate(idParamsSchema, 'params'), asyncHandler(controller.get));
  router.patch('/:id/status', validate(idParamsSchema, 'params'), validate(statusSchema), asyncHandler(controller.setStatus));
  router.patch('/:id/role', validate(idParamsSchema, 'params'), validate(roleSchema), asyncHandler(controller.setRole));
  return router;
}
