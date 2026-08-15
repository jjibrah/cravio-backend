import assert from 'node:assert/strict';
import test from 'node:test';

import request from 'supertest';

import { admin, owner, testApp } from '../helpers/test-app.js';

const asAdmin = () => testApp({ authUserId: admin.clerk_user_id });
test('admin lists users', async () => {
  const r = await request(asAdmin().app).get('/api/admin/users');
  assert.equal(r.status, 200);
  assert.equal(r.body.data.total, 2);
});
test('admin retrieves a user', async () =>
  assert.equal((await request(asAdmin().app).get(`/api/admin/users/${owner.id}`)).status, 200));
test('admin changes account status', async () => {
  const r = await request(asAdmin().app)
    .patch(`/api/admin/users/${owner.id}/status`)
    .send({ status: 'suspended' });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.status, 'suspended');
});
test('admin changes role', async () => {
  const r = await request(asAdmin().app)
    .patch(`/api/admin/users/${owner.id}/role`)
    .send({ role: 'admin' });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.role, 'admin');
});
test('owner is blocked from admin routes', async () =>
  assert.equal((await request(testApp().app).get('/api/admin/users')).status, 403));
test('invalid role is rejected', async () =>
  assert.equal(
    (
      await request(asAdmin().app)
        .patch(`/api/admin/users/${owner.id}/role`)
        .send({ role: 'superadmin' })
    ).status,
    400,
  ));
test('invalid status is rejected', async () =>
  assert.equal(
    (
      await request(asAdmin().app)
        .patch(`/api/admin/users/${owner.id}/status`)
        .send({ status: 'banned' })
    ).status,
    400,
  ));
