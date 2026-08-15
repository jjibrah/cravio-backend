import { Router } from 'express';
import { requireActiveAccount, requireRole } from '../auth/auth.middleware.js';
import { asyncHandler } from '../shared/async-handler.js';
import { validate } from '../shared/validate.js';
import { bulkTableSchema, createTableSchema, idParamsSchema, qrQuerySchema, tokenParamsSchema, updateTableSchema } from './table.validation.js';

export function createTableRouter({ auth, controller }) {
  const router = Router(); router.use(auth, requireActiveAccount, requireRole('owner'));
  router.post('/bulk', validate(bulkTableSchema), asyncHandler(controller.bulkCreate));
  router.get('/qr/print', asyncHandler(controller.printAll));
  router.post('/', validate(createTableSchema), asyncHandler(controller.create));
  router.get('/', asyncHandler(controller.list));
  router.get('/:id/qr/print', validate(idParamsSchema, 'params'), asyncHandler(controller.printOne));
  router.post('/:id/qr/regenerate', validate(idParamsSchema, 'params'), asyncHandler(controller.regenerate));
  router.get('/:id/qr', validate(idParamsSchema, 'params'), validate(qrQuerySchema, 'query'), asyncHandler(controller.qr));
  router.get('/:id', validate(idParamsSchema, 'params'), asyncHandler(controller.get));
  router.patch('/:id', validate(idParamsSchema, 'params'), validate(updateTableSchema), asyncHandler(controller.update));
  router.delete('/:id', validate(idParamsSchema, 'params'), asyncHandler(controller.deactivate));
  return router;
}

export function createPublicQrRouter(controller) {
  const router = Router(); router.get('/:token', validate(tokenParamsSchema, 'params'), asyncHandler(controller.resolve)); return router;
}
