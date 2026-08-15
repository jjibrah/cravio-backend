import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';
import express from 'express';
import request from 'supertest';
import { buildConfig, parseEnvironment } from '../../src/core/config/env.js';
import { createLogger } from '../../src/core/logging/logger.js';
import { createRateLimiter } from '../../src/core/middleware/rate-limit.js';
import { requestId } from '../../src/core/middleware/request-context.js';
import { createErrorHandler, notFoundHandler } from '../../src/shared/error-handler.js';
import { installGracefulShutdown } from '../../src/core/runtime/lifecycle.js';
import { testApp } from '../helpers/test-app.js';

const production = { NODE_ENV: 'production', PORT: '3000', DATABASE_URL: 'postgresql://user:pass@db/cravio', CLERK_SECRET_KEY: 'secret', CLERK_PUBLISHABLE_KEY: 'publishable', CLERK_WEBHOOK_SIGNING_SECRET: 'webhook', FRONTEND_URL: 'https://app.cravio.test', PUBLIC_APP_URL: 'https://cravio.test', STORAGE_PROVIDER: 's3', MEDIA_STORAGE_BUCKET: 'bucket', MEDIA_STORAGE_ACCESS_KEY_ID: 'access', MEDIA_STORAGE_SECRET_ACCESS_KEY: 'storage-secret', MEDIA_PUBLIC_BASE_URL: 'https://cdn.cravio.test' };

test('environment configuration accepts valid production values and rejects missing, malformed, or unsupported values', () => {
  const config = buildConfig(production); assert.equal(config.database.max, 10); assert.equal(config.media.provider, 's3'); assert.equal(config.media.required, true);
  assert.throws(() => parseEnvironment({ ...production, DATABASE_URL: undefined }), /DATABASE_URL/);
  assert.throws(() => parseEnvironment({ ...production, PORT: '-1' }));
  assert.throws(() => parseEnvironment({ ...production, FRONTEND_URL: 'not-a-url' }));
  assert.throws(() => parseEnvironment({ ...production, STORAGE_PROVIDER: 'ftp' }));
});

test('health distinguishes liveness from dependency readiness', async () => {
  const ready = testApp({ db: { query: async () => ({ rows: [{ '?column?': 1 }] }) }, healthStorage: { health: async () => true } }).app;
  assert.deepEqual((await request(ready).get('/health')).body, { status: 'ok' }); const response = await request(ready).get('/health/ready'); assert.equal(response.status, 200); assert.equal(response.body.status, 'ready');
  const unavailable = testApp({ db: { query: async () => { throw new Error('offline'); } }, healthStorage: { health: async () => true } }).app; const failed = await request(unavailable).get('/health/ready'); assert.equal(failed.status, 503); assert.equal(failed.body.checks.database, 'unavailable'); assert.doesNotMatch(JSON.stringify(failed.body), /offline/);
});

test('request IDs are generated, trusted only when UUID-shaped, returned, and logged without request bodies', async () => {
  const entries = []; const log = { debug: (_m, c) => entries.push(c), info: (_m, c) => entries.push(c), warn: (_m, c) => entries.push(c), error: (_m, c) => entries.push(c) }; const app = testApp({ logger: log }).app;
  const generated = await request(app).get('/health'); assert.match(generated.headers['x-request-id'], /^[0-9a-f-]{36}$/); const id = '550e8400-e29b-41d4-a716-446655440000'; const reused = await request(app).get('/health').set('x-request-id', id); assert.equal(reused.headers['x-request-id'], id); assert.ok(entries.some((entry) => entry.request_id === id && entry.method === 'GET')); assert.ok(entries.every((entry) => !('authorization' in entry) && !('body' in entry)));
});

test('CORS allowlists configured origins, supports preflight, and denies unknown origins', async () => {
  const appConfig = { ...buildConfig({ NODE_ENV: 'test', PUBLIC_APP_URL: 'http://localhost:3000', FRONTEND_URL: 'https://allowed.test' }), rateLimits: { general: 1000 } }; const app = testApp({ appConfig }).app;
  assert.equal((await request(app).options('/health').set('origin', 'https://allowed.test')).status, 204); const allowed = await request(app).get('/health').set('origin', 'https://allowed.test'); assert.equal(allowed.headers['access-control-allow-origin'], 'https://allowed.test'); const denied = await request(app).get('/health').set('origin', 'https://evil.test'); assert.equal(denied.status, 403); assert.equal(denied.body.error.code, 'CORS_ORIGIN_DENIED');
});

test('central rate limiter and JSON errors return stable safe responses', async () => {
  const app = testApp({ generalLimiter: createRateLimiter({ limit: 1 }) }).app; assert.equal((await request(app).get('/limited')).status, 404); assert.equal((await request(app).get('/limited')).status, 429); assert.equal((await request(app).get('/health')).status, 200);
  const errors = express(); const logs = []; errors.use(requestId); errors.get('/explode', () => { throw new Error('database password secret'); }); errors.use(notFoundHandler); errors.use(createErrorHandler({ error: (...args) => logs.push(args), warn() {}, info() {}, debug() {} })); const unknown = await request(errors).get('/explode'); assert.equal(unknown.status, 500); assert.equal(unknown.body.error.code, 'INTERNAL_SERVER_ERROR'); assert.doesNotMatch(JSON.stringify(unknown.body), /password|stack/i); const missing = await request(errors).get('/missing'); assert.equal(missing.status, 404); assert.equal(missing.body.error.code, 'ROUTE_NOT_FOUND'); assert.equal(logs.length, 1);
});

test('structured logger redacts sensitive fields', () => { const lines = []; const sink = { info: (line) => lines.push(line), log: (line) => lines.push(line) }; const log = createLogger({ sink }); log.info('request', { authorization: 'Bearer secret', session_token: 'private', method: 'GET' }); const entry = JSON.parse(lines[0]); assert.equal(entry.authorization, '[REDACTED]'); assert.equal(entry.session_token, '[REDACTED]'); assert.equal(entry.method, 'GET'); });

test('canonical database snapshot includes every current module table', async () => { const sql = await readFile(new URL('../../database/db.sql', import.meta.url), 'utf8'); for (const table of ['users', 'restaurants', 'menu_categories', 'menu_items', 'media_assets', 'restaurant_tables', 'admin_audit_logs', 'analytics_sessions', 'analytics_events']) assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`)); assert.match(sql, /CREATE EXTENSION IF NOT EXISTS pgcrypto/); });

test('graceful shutdown closes the HTTP server and database once', async () => { const processRef = /** @type {any} */ (new EventEmitter()); const exits = []; processRef.exit = (code) => exits.push(code); let serverClosed = 0; let databaseClosed = 0; const shutdown = installGracefulShutdown({ server: { close: (done) => { serverClosed += 1; done(); } }, closeDatabase: async () => { databaseClosed += 1; }, logger: { info() {}, error() {} }, processRef }); await shutdown('test'); assert.equal(serverClosed, 1); assert.equal(databaseClosed, 1); assert.deepEqual(exits, [0]); });
