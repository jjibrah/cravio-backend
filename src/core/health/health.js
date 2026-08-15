import { Router } from 'express';
import { setTimeout } from 'node:timers';
const timeout = (promise, ms) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('Health check timed out')), ms))]);
export function createHealthRouter({ db, storage, timeoutMs = 2000 }) {
  const router = Router(); router.get('/', (_req, res) => res.json({ status: 'ok' }));
  router.get('/ready', async (_req, res) => { const checks = { database: 'unavailable', storage: 'unavailable' }; try { await timeout(db.query('SELECT 1'), timeoutMs); checks.database = 'ok'; } catch { checks.database = 'unavailable'; } try { const result = await timeout(storage.health(), timeoutMs); checks.storage = result ? 'ok' : 'unavailable'; } catch { checks.storage = 'unavailable'; } const ready = checks.database === 'ok' && checks.storage === 'ok'; return res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready', checks }); }); return router;
}
