import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { admin, testApp } from '../helpers/test-app.js';

test('owner can access owner profile route', async () => assert.equal((await request(testApp().app).get('/api/users/me')).status, 200));
test('owner cannot access admin route', async () => assert.equal((await request(testApp().app).get('/api/admin/users')).status, 403));
test('admin can access admin route', async () => assert.equal((await request(testApp({ authUserId: admin.clerk_user_id }).app).get('/api/admin/users')).status, 200));
test('multi-role middleware permits owner routes and admin user identity', async () => {
  assert.equal((await request(testApp({ authUserId: admin.clerk_user_id }).app).get('/api/users/me')).status, 200);
});
