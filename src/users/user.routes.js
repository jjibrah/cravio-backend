import { Router } from 'express';
import { asyncHandler } from '../shared/async-handler.js';
import { validate } from '../shared/validate.js';
import { requireActiveAccount } from '../auth/auth.middleware.js';
import { profileSchema } from './user.validation.js';

export function createUserRouter({ auth, controller }) {
  const router = Router();
  router.use(auth);
  router.get('/me', asyncHandler(controller.me));
  router.patch('/me', requireActiveAccount, validate(profileSchema), asyncHandler(controller.updateMe));
  return router;
}
