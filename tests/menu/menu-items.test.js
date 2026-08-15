import assert from 'node:assert/strict';
import test from 'node:test';

import request from 'supertest';

import { menuApp, restaurantA, restaurantB, validItem } from './menu-test-helpers.js';

test('owner creates an item in their category with normalized decimal price and order', async () => {
  const setup = menuApp();
  const category = await setup.menus.createCategory(restaurantA.id, { name: 'Mains' });
  const first = await request(setup.app).post('/api/menu/items').send(validItem(category.id));
  const second = await request(setup.app)
    .post('/api/menu/items')
    .send({ ...validItem(category.id), name: 'Soup', price: 5 });
  assert.equal(first.status, 201);
  assert.equal(first.body.data.restaurant_id, restaurantA.id);
  assert.equal(first.body.data.price, '12.50');
  assert.equal(second.body.data.display_order, 1);
});
test('item validation rejects negative prices, invalid categories, and protected fields', async () => {
  const setup = menuApp();
  const category = await setup.menus.createCategory(restaurantA.id, { name: 'Mains' });
  assert.equal(
    (
      await request(setup.app)
        .post('/api/menu/items')
        .send({ ...validItem(category.id), price: -1 })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(setup.app)
        .post('/api/menu/items')
        .send(validItem('00000000-0000-4000-8000-000000000000'))
    ).status,
    400,
  );
  assert.equal(
    (
      await request(setup.app)
        .post('/api/menu/items')
        .send({ ...validItem(category.id), restaurant_id: restaurantB.id })
    ).status,
    400,
  );
});
test('owner updates items, toggles availability, and deletion deactivates instead of removing', async () => {
  const setup = menuApp();
  const category = await setup.menus.createCategory(restaurantA.id, { name: 'Mains' });
  const item = await setup.menus.createItem(restaurantA.id, validItem(category.id));
  assert.equal(
    (
      await request(setup.app)
        .patch(`/api/menu/items/${item.id}`)
        .send({ name: 'Updated', is_active: false })
    ).body.data.name,
    'Updated',
  );
  assert.equal(
    (
      await request(setup.app)
        .patch(`/api/menu/items/${item.id}/availability`)
        .send({ is_available: false })
    ).body.data.is_available,
    false,
  );
  assert.equal(
    (
      await request(setup.app)
        .patch(`/api/menu/items/${item.id}/availability`)
        .send({ is_available: true })
    ).body.data.is_available,
    true,
  );
  assert.equal(
    (await request(setup.app).delete(`/api/menu/items/${item.id}`)).body.data.is_active,
    false,
  );
  assert.ok(setup.menus.items.some((x) => x.id === item.id));
});
test('category from another restaurant is rejected', async () => {
  const setup = menuApp();
  const foreign = await setup.menus.createCategory(restaurantB.id, { name: 'Foreign' });
  const response = await request(setup.app).post('/api/menu/items').send(validItem(foreign.id));
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'INVALID_CATEGORY');
});
test('IDOR protection hides foreign items from every owner mutation', async () => {
  const setup = menuApp();
  const foreignCategory = await setup.menus.createCategory(restaurantB.id, { name: 'Foreign' });
  const foreignItem = await setup.menus.createItem(restaurantB.id, validItem(foreignCategory.id));
  const responses = await Promise.all([
    request(setup.app).get(`/api/menu/items/${foreignItem.id}`),
    request(setup.app).patch(`/api/menu/items/${foreignItem.id}`).send({ name: 'Stolen' }),
    request(setup.app).delete(`/api/menu/items/${foreignItem.id}`),
    request(setup.app)
      .patch(`/api/menu/items/${foreignItem.id}/availability`)
      .send({ is_available: false }),
  ]);
  responses.forEach((response) => assert.equal(response.status, 404));
});
test('item filters remain scoped to owner restaurant', async () => {
  const setup = menuApp();
  const category = await setup.menus.createCategory(restaurantA.id, { name: 'A' });
  const foreignCategory = await setup.menus.createCategory(restaurantB.id, { name: 'B' });
  await setup.menus.createItem(restaurantA.id, { ...validItem(category.id), is_available: false });
  await setup.menus.createItem(restaurantB.id, validItem(foreignCategory.id));
  const response = await request(setup.app).get(
    `/api/menu/items?category_id=${category.id}&available=false`,
  );
  assert.equal(response.status, 200);
  assert.equal(response.body.data.length, 1);
  assert.equal(response.body.data[0].restaurant_id, restaurantA.id);
});
