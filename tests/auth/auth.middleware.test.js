import assert from 'node:assert/strict';
import test from 'node:test';

import request from 'supertest';

import { MemoryUsers, owner, testApp } from '../helpers/test-app.js';

test('missing authentication is rejected', async () =>
  assert.equal(
    (await request(testApp({ authUserId: null }).app).get('/api/users/me')).status,
    401,
  ));
test('invalid Clerk session is rejected', async () =>
  assert.equal(
    (await request(testApp({ authError: new Error('invalid') }).app).get('/api/users/me')).status,
    401,
  ));
test('valid Clerk session loads its local user', async () => {
  const response = await request(testApp().app).get('/api/users/me');
  assert.equal(response.status, 200);
  assert.equal(response.body.data.clerk_user_id, owner.clerk_user_id);
});
test('Clerk user without a local record is rejected safely', async () =>
  assert.equal(
    (await request(testApp({ authUserId: 'missing' }).app).get('/api/users/me')).status,
    401,
  ));
for (const status of ['suspended', 'disabled'])
  test(`${status} account is blocked from business actions`, async () => {
    const users = new MemoryUsers([{ ...owner, status }]);
    assert.equal(
      (await request(testApp({ users }).app).patch('/api/users/me').send({ first_name: 'New' }))
        .status,
      403,
    );
  });
test('disabled account is denied even on the profile route', async () => {
  const users = new MemoryUsers([{ ...owner, status: 'disabled' }]);
  assert.equal((await request(testApp({ users }).app).get('/api/users/me')).status, 403);
});
test('active account can perform business actions', async () =>
  assert.equal(
    (await request(testApp().app).patch('/api/users/me').send({ first_name: 'New' })).status,
    200,
  ));
