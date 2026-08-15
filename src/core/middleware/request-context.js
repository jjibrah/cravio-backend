import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const requestId = (req, res, next) => { const incoming = req.get('x-request-id'); req.id = incoming && uuid.test(incoming) ? incoming : randomUUID(); res.set('x-request-id', req.id); next(); };
export const requestLogger = (log) => (req, res, next) => { const started = performance.now(); res.on('finish', () => { const context = { request_id: req.id, method: req.method, path: req.originalUrl.split('?')[0], status: res.statusCode, duration_ms: Math.round(performance.now() - started), user_id: req.auth?.user?.id }; const method = req.path.startsWith('/api/public/analytics') ? 'debug' : res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'; log[method]('HTTP request completed', context); }); next(); };
