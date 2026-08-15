import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { MemoryUsers, testApp } from '../helpers/test-app.js';

const data = { id: 'clerk_new', primary_email_address_id: 'email_1', email_addresses: [{ id: 'email_1', email_address: 'New@Cravio.test' }], first_name: 'New', last_name: 'Owner' };
const call = async (event, users = new MemoryUsers([])) => {
  const setup = testApp({ users, webhookVerifier: async () => event });
  return { users, response: await request(setup.app).post('/api/webhooks/clerk').set('content-type', 'application/json').send(event) };
};
test('valid signed user.created creates a local owner', async () => { const { users, response } = await call({ type: 'user.created', data }); assert.equal(response.status, 200); assert.equal(users.rows[0].role, 'owner'); assert.equal(users.rows[0].email, 'new@cravio.test'); });
test('duplicate user.created is idempotent', async () => { const users = new MemoryUsers([]); await call({ type: 'user.created', data }, users); await call({ type: 'user.created', data }, users); assert.equal(users.rows.length, 1); });
test('user.updated syncs identity but preserves role and status', async () => { const users = new MemoryUsers([{ id: 'local', clerk_user_id: 'clerk_new', email: 'old@test.dev', role: 'admin', status: 'suspended' }]); await call({ type: 'user.updated', data }, users); assert.equal(users.rows[0].email, 'new@cravio.test'); assert.equal(users.rows[0].role, 'admin'); assert.equal(users.rows[0].status, 'suspended'); });
test('user.deleted disables rather than deletes', async () => { const users = new MemoryUsers([{ id: 'local', clerk_user_id: 'clerk_new', email: 'old@test.dev', role: 'owner', status: 'active' }]); await call({ type: 'user.deleted', data: { id: 'clerk_new' } }, users); assert.equal(users.rows.length, 1); assert.equal(users.rows[0].status, 'disabled'); });
test('invalid webhook signature is rejected', async () => { const app = testApp({ webhookVerifier: async () => { throw new Error('bad signature'); } }).app; const response = await request(app).post('/api/webhooks/clerk').set('content-type', 'application/json').send({}); assert.equal(response.status, 401); assert.equal(response.body.error.code, 'INVALID_WEBHOOK_SIGNATURE'); });
