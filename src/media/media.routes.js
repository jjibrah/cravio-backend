import { Router } from 'express';
import { requireActiveAccount, requireRole } from '../auth/auth.middleware.js';
import { asyncHandler } from '../shared/async-handler.js';
import { validate } from '../shared/validate.js';
import { completeVideoSchema, emptySchema, itemParamsSchema, mediaParamsSchema, thumbnailUploadSchema, uploadSchema } from './media.validation.js';

export function createMediaRouter({ auth, controller }) {
  const router = Router();
  router.use(auth, requireActiveAccount, requireRole('owner'));
  router.post('/menu-items/:itemId/video-upload', validate(itemParamsSchema, 'params'), validate(uploadSchema), asyncHandler(controller.createVideoUpload));
  router.get('/menu-items/:itemId', validate(itemParamsSchema, 'params'), asyncHandler(controller.getForItem));
  router.post('/:id/complete', validate(mediaParamsSchema, 'params'), validate(completeVideoSchema), asyncHandler(controller.completeVideo));
  router.post('/:id/thumbnail-upload', validate(mediaParamsSchema, 'params'), validate(thumbnailUploadSchema), asyncHandler(controller.createThumbnailUpload));
  router.post('/:id/thumbnail-complete', validate(mediaParamsSchema, 'params'), validate(emptySchema), asyncHandler(controller.completeThumbnail));
  router.delete('/:id', validate(mediaParamsSchema, 'params'), asyncHandler(controller.remove));
  return router;
}
