import assert from 'node:assert/strict';
import test from 'node:test';

import request from 'supertest';

import { MenuRepository } from '../../src/menu/menu.repository.js';
import { menuApp, restaurantA, restaurantB, validItem } from './menu-test-helpers.js';

test('items reorder transactionally within their category and retrieval respects order', async () => {
  const setup = menuApp();
  const category = await setup.menus.createCategory(restaurantA.id, { name: 'Mains' });
  const a = await setup.menus.createItem(restaurantA.id, { ...validItem(category.id), name: 'A' });
  const b = await setup.menus.createItem(restaurantA.id, { ...validItem(category.id), name: 'B' });
  const c = await setup.menus.createItem(restaurantA.id, { ...validItem(category.id), name: 'C' });
  const response = await request(setup.app)
    .post('/api/menu/items/reorder')
    .send({ category_id: category.id, item_ids: [c.id, a.id, b.id] });
  assert.equal(response.status, 200);
  assert.deepEqual(
    response.body.data.map((x) => x.name),
    ['C', 'A', 'B'],
  );
});
test('item reorder rejects duplicates, missing IDs, wrong categories, and foreign restaurants', async () => {
  const setup = menuApp();
  const category = await setup.menus.createCategory(restaurantA.id, { name: 'A' });
  const other = await setup.menus.createCategory(restaurantA.id, { name: 'Other' });
  const foreign = await setup.menus.createCategory(restaurantB.id, { name: 'Foreign' });
  const a = await setup.menus.createItem(restaurantA.id, validItem(category.id));
  const wrong = await setup.menus.createItem(restaurantA.id, validItem(other.id));
  const foreignItem = await setup.menus.createItem(restaurantB.id, validItem(foreign.id));
  for (const item_ids of [[a.id, a.id], [], [a.id, wrong.id], [foreignItem.id]]) {
    assert.equal(
      (
        await request(setup.app)
          .post('/api/menu/items/reorder')
          .send({ category_id: category.id, item_ids })
      ).status,
      400,
    );
  }
});
test('repository transaction rolls back and releases when reorder query fails', async () => {
  const calls = [];
  const client = {
    query: async (sql) => {
      calls.push(sql);
      if (sql.startsWith('SELECT id FROM menu_items')) return { rows: [{ id: 'a' }] };
      if (sql.startsWith('UPDATE menu_items')) throw new Error('failure');
      return { rows: [] };
    },
    release: () => calls.push('RELEASE'),
  };
  const repository = new MenuRepository({ connect: async () => client });
  await assert.rejects(repository.reorderItems('restaurant', 'category', ['a']), /failure/);
  assert.ok(calls.includes('ROLLBACK'));
  assert.ok(calls.includes('RELEASE'));
  assert.ok(!calls.includes('COMMIT'));
});
test('public menu hides inactive categories/items, retains unavailable items, and requires published active restaurant', async () => {
  const setup = menuApp();
  const visible = await setup.menus.createCategory(restaurantA.id, { name: 'Visible' });
  const hidden = await setup.menus.createCategory(restaurantA.id, {
    name: 'Hidden',
    is_active: false,
  });
  await setup.menus.createItem(restaurantA.id, { ...validItem(visible.id), is_available: false });
  await setup.menus.createItem(restaurantA.id, {
    ...validItem(visible.id),
    name: 'Inactive',
    is_active: false,
  });
  await setup.menus.createItem(restaurantA.id, validItem(hidden.id));
  const { MenuService } = await import('../../src/menu/menu.service.js');
  const service = new MenuService({ menus: setup.menus, restaurants: setup.restaurants });
  const result = await service.getPublicMenu(restaurantA.id);
  assert.equal(result.categories.length, 1);
  assert.equal(result.categories[0].items.length, 1);
  assert.equal(result.categories[0].items[0].is_available, false);
  setup.restaurants.rows[0].is_published = false;
  await assert.rejects(
    service.getPublicMenu(restaurantA.id),
    (error) => /** @type {any} */ (error).code === 'RESTAURANT_NOT_FOUND',
  );
});
