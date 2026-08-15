import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { requireActiveAccount, requireRole } from '../auth/auth.middleware.js';
import { asyncHandler } from '../shared/async-handler.js';
import { validate } from '../shared/validate.js';
import { eventSchema, itemListSchema, itemParamsSchema, rangeSchema, sessionSchema } from './analytics.validation.js';

const limiter = (limit) => rateLimit({ windowMs: 60_000, limit, standardHeaders: 'draft-8', legacyHeaders: false, handler: (_req, res) => res.status(429).json({ success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests' } }) });
export const createAnalyticsLimiters = ({ sessionLimit = 30, eventLimit = 300 } = {}) => ({ sessions: limiter(sessionLimit), events: limiter(eventLimit) });
export function createPublicAnalyticsRouter({ controller, limits = createAnalyticsLimiters() }) { const router = Router(); router.post('/session', limits.sessions, validate(sessionSchema), asyncHandler(controller.createSession)); router.post('/events', limits.events, validate(eventSchema), asyncHandler(controller.event)); return router; }
export function createAnalyticsRouter({ auth, controller }) { const router = Router(); router.use(auth, requireActiveAccount, requireRole('owner')); router.get('/overview', validate(rangeSchema, 'query'), asyncHandler(controller.overview)); router.get('/items', validate(itemListSchema, 'query'), asyncHandler(controller.items)); router.get('/items/:id', validate(itemParamsSchema, 'params'), validate(rangeSchema, 'query'), asyncHandler(controller.item)); router.get('/categories', validate(rangeSchema, 'query'), asyncHandler(controller.categories)); router.get('/tables', validate(rangeSchema, 'query'), asyncHandler(controller.tables)); return router; }
