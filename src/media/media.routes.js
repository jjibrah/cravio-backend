import { Router } from 'express';

import { requireActiveAccount, requireRole } from '../auth/auth.middleware.js';
import { createRateLimiter } from '../core/middleware/rate-limit.js';
import { asyncHandler } from '../shared/async-handler.js';
import { validate } from '../shared/validate.js';
import {
  completeVideoSchema,
  emptySchema,
  itemParamsSchema,
  mediaParamsSchema,
  thumbnailUploadSchema,
  uploadSchema,
} from './media.validation.js';

export const createMediaUploadLimiter = ({ limit = 20 } = {}) =>
  createRateLimiter({ windowMs: 60 * 60 * 1000, limit, message: 'Too many media upload requests' });
export function createMediaRouter({
  auth,
  controller,
  uploadLimiter = createMediaUploadLimiter(),
}) {
  const router = Router();
  router.use(auth, requireActiveAccount, requireRole('owner'));
  router.post(
    '/menu-items/:itemId/video-upload',
    uploadLimiter,
    validate(itemParamsSchema, 'params'),
    validate(uploadSchema),
    asyncHandler(controller.createVideoUpload),
  );
  router.get(
    '/menu-items/:itemId',
    validate(itemParamsSchema, 'params'),
    asyncHandler(controller.getForItem),
  );
  router.post(
    '/:id/complete',
    uploadLimiter,
    validate(mediaParamsSchema, 'params'),
    validate(completeVideoSchema),
    asyncHandler(controller.completeVideo),
  );
  router.post(
    '/:id/thumbnail-upload',
    uploadLimiter,
    validate(mediaParamsSchema, 'params'),
    validate(thumbnailUploadSchema),
    asyncHandler(controller.createThumbnailUpload),
  );
  router.post(
    '/:id/thumbnail-complete',
    uploadLimiter,
    validate(mediaParamsSchema, 'params'),
    validate(emptySchema),
    asyncHandler(controller.completeThumbnail),
  );
  router.delete('/:id', validate(mediaParamsSchema, 'params'), asyncHandler(controller.remove));
  return router;
}
