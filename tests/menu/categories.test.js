import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { MemoryUsers } from '../helpers/test-app.js';
import { menuApp, owner, restaurantA, restaurantB, validCategory } from './menu-test-helpers.js';

test('active owner creates a category for their own restaurant with automatic order', async () => {
  const setup = menuApp();
  const first = await request(setup.app).post('/api/menu/categories').send(validCategory);
  const second = await request(setup.app).post('/api/menu/categories').send({ name: 'Drinks' });
  assert.equal(first.status, 201); assert.equal(first.body.data.restaurant_id, restaurantA.id);
  assert.equal(second.body.data.display_order, 1);
});
test('category creation rejects unauthenticated, suspended, disabled, admin, and blank-name requests', async () => {
  assert.equal((await request(menuApp({ authUserId: null }).app).post('/api/menu/categories').send(validCategory)).status, 401);
  for (const status of ['suspended', 'disabled']) {
    const users = new MemoryUsers([{ ...owner, status }]);
    assert.equal((await request(menuApp({ users }).app).post('/api/menu/categories').send(validCategory)).status, 403);
  }
  assert.equal((await request(menuApp({ authUserId: 'clerk_admin' }).app).post('/api/menu/categories').send(validCategory)).status, 403);
  assert.equal((await request(menuApp().app).post('/api/menu/categories').send({ name: ' ' })).status, 400);
});
test('categories list in display order and can update safe fields', async () => {
  const setup = menuApp();
  const a = (await request(setup.app).post('/api/menu/categories').send(validCategory)).body.data;
  const b = (await request(setup.app).post('/api/menu/categories').send({ name: 'Drinks' })).body.data;
  await request(setup.app).post('/api/menu/categories/reorder').send({ category_ids: [b.id, a.id] });
  const list = await request(setup.app).get('/api/menu/categories');
  assert.deepEqual(list.body.data.map((x) => x.id), [b.id, a.id]);
  const updated = await request(setup.app).patch(`/api/menu/categories/${a.id}`).send({ description: 'Updated', is_active: false });
  assert.equal(updated.body.data.is_active, false);
  assert.equal((await request(setup.app).patch(`/api/menu/categories/${a.id}`).send({ restaurant_id: restaurantB.id })).status, 400);
});
test('category ownership prevents cross-restaurant read, update, delete, and reorder', async () => {
  const setup = menuApp();
  const foreign = await setup.menus.createCategory(restaurantB.id, { name: 'Foreign' });
  for (const call of [
    request(setup.app).get(`/api/menu/categories/${foreign.id}`),
    request(setup.app).patch(`/api/menu/categories/${foreign.id}`).send({ name: 'Stolen' }),
    request(setup.app).delete(`/api/menu/categories/${foreign.id}`)
  ]) assert.equal((await call).status, 404);
  assert.equal((await request(setup.app).post('/api/menu/categories/reorder').send({ category_ids: [foreign.id] })).status, 400);
});
test('empty category deletes but a category containing items returns conflict', async () => {
  const setup = menuApp();
  const empty = await setup.menus.createCategory(restaurantA.id, { name: 'Empty' });
  assert.equal((await request(setup.app).delete(`/api/menu/categories/${empty.id}`)).status, 204);
  const used = await setup.menus.createCategory(restaurantA.id, { name: 'Used' });
  await setup.menus.createItem(restaurantA.id, { category_id: used.id, name: 'Dish', price: '1.00' });
  const response = await request(setup.app).delete(`/api/menu/categories/${used.id}`);
  assert.equal(response.status, 409); assert.equal(response.body.error.code, 'CATEGORY_HAS_ITEMS');
});
test('duplicate and incomplete category reorder payloads are rejected', async () => {
  const setup = menuApp(); const a = await setup.menus.createCategory(restaurantA.id, { name: 'A' }); const b = await setup.menus.createCategory(restaurantA.id, { name: 'B' });
  assert.equal((await request(setup.app).post('/api/menu/categories/reorder').send({ category_ids: [a.id, a.id] })).status, 400);
  assert.equal((await request(setup.app).post('/api/menu/categories/reorder').send({ category_ids: [b.id] })).status, 400);
});
