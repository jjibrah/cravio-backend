import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { owner, testApp } from '../helpers/test-app.js';

test('GET /api/users/me returns normalized profile', async () => {
  const response = await request(testApp().app).get('/api/users/me');
  assert.equal(response.status, 200); assert.equal(response.body.data.email, owner.email);
});
test('GET /api/users/me rejects unauthenticated request', async () => assert.equal((await request(testApp({ authUserId: null }).app).get('/api/users/me')).status, 401));
test('PATCH /api/users/me updates only safe fields', async () => {
  const response = await request(testApp().app).patch('/api/users/me').send({ first_name: 'Updated', last_name: 'Name' });
  assert.equal(response.status, 200); assert.equal(response.body.data.first_name, 'Updated');
});
test('PATCH /api/users/me rejects role and status mass assignment', async () => {
  const response = await request(testApp().app).patch('/api/users/me').send({ first_name: 'Okay', role: 'admin', status: 'disabled' });
  assert.equal(response.status, 400); assert.equal(response.body.error.code, 'VALIDATION_ERROR');
});
