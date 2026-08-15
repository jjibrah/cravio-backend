import { rateLimit } from 'express-rate-limit';
export const createRateLimiter = ({ limit, windowMs = 60_000, message = 'Too many requests' }) => rateLimit({ windowMs, limit, standardHeaders: 'draft-8', legacyHeaders: false, handler: (_req, res) => res.status(429).json({ success: false, error: { code: 'RATE_LIMITED', message } }) });
