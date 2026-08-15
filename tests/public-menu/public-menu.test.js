import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { testApp } from '../helpers/test-app.js';
import { createPublicMenuLimiter } from '../../src/public-menu/public-menu.routes.js';

const restaurantId = randomUUID(); const tableId = randomUUID(); const token = randomUUID();
const categoryA = randomUUID(); const categoryB = randomUUID(); const categoryHidden = randomUUID(); const categoryEmpty = randomUUID();
const itemAvailable = randomUUID(); const itemUnavailable = randomUUID(); const itemHidden = randomUUID(); const itemSecond = randomUUID();

class PublicTableRepository {
  constructor(state) { this.state = state; }
  async resolve(value) {
    if (value !== this.state.token || !this.state.tableActive || this.state.restaurantStatus !== 'active' || !this.state.published) return null;
    return { table_id: tableId, table_name: 'Table 4', restaurant_id: restaurantId, restaurant_name: 'Urban Fork', restaurant_slug: 'urban-fork' };
  }
}

class MemoryPublicMenus {
  constructor(state) { this.state = state; this.calls = 0; }
  async findContext(rid, tid) {
    this.calls += 1;
    if (rid !== restaurantId || tid !== tableId || !this.state.tableActive || this.state.restaurantStatus !== 'active' || !this.state.published) return null;
    return { restaurant_id: restaurantId, restaurant_name: 'Urban Fork', slug: 'urban-fork', description: 'Modern dining', logo_url: 'https://cdn.test/logo.webp', cover_image_url: 'https://cdn.test/cover.webp', currency: 'MYR', table_id: tableId, table_name: 'Table 4', table_code: 'T04' };
  }
  async findMenuRows(_restaurantId, availableOnly) {
    this.calls += 1;
    return this.state.rows.filter((row) => row.category_active && row.item_active && (!availableOnly || row.is_available)).sort((a, b) => a.category_order - b.category_order || a.item_order - b.item_order);
  }
}

const row = (overrides) => ({ category_id: categoryA, category_name: 'Mains', category_description: 'Main dishes', category_order: 2, category_active: true, item_id: itemAvailable, item_name: 'Pasta', item_description: 'Truffle pasta', price: '32.00', is_available: true, item_active: true, item_order: 2, video_url: 'https://cdn.test/pasta.mp4', thumbnail_url: 'https://cdn.test/pasta.webp', duration_seconds: '24.500', ...overrides });

function setup(overrides = {}) {
  const state = { token, tableActive: true, restaurantStatus: 'active', published: true, rows: [
    row({ category_id: categoryB, category_name: 'Drinks', category_order: 1, item_id: itemSecond, item_name: 'Tea', item_order: 1, video_url: null, thumbnail_url: null }),
    row({ item_id: itemUnavailable, item_name: 'Sold Out Dish', item_order: 1, is_available: false, video_url: null, thumbnail_url: null }),
    row({}),
    row({ category_id: categoryHidden, category_name: 'Hidden', category_order: 0, category_active: false }),
    row({ item_id: itemHidden, item_name: 'Inactive', item_active: false }),
    // No row is emitted for categoryEmpty, matching the production inner join.
  ], ...overrides };
  const publicMenus = new MemoryPublicMenus(state); let clerkCalls = 0;
  const app = testApp({
    tableRepository: new PublicTableRepository(state),
    restaurantRepository: { findByOwnerUserId: async () => null, findPublishedById: async () => null },
    publicMenuRepository: publicMenus,
    publicMenuLimiter: overrides.limiter || ((_req, _res, next) => next()),
    clerkMiddleware: (_req, _res, next) => { clerkCalls += 1; next(); }
  }).app;
  return { app, state, publicMenus, clerkCalls: () => clerkCalls };
}

test('public menu requires no authentication and returns ordered restaurant, table, items, prices, availability, and media', async () => {
  const setupData = setup(); const response = await request(setupData.app).get(`/api/public/menu/${token}`);
  assert.equal(response.status, 200); assert.equal(setupData.clerkCalls(), 0); assert.equal(response.body.data.restaurant.currency, 'MYR'); assert.equal(response.body.data.table.code, 'T04');
  assert.deepEqual(response.body.data.categories.map((x) => x.name), ['Drinks', 'Mains']);
  assert.deepEqual(response.body.data.categories[1].items.map((x) => x.name), ['Sold Out Dish', 'Pasta']);
  assert.equal(response.body.data.categories[1].items[0].is_available, false); assert.equal(response.body.data.categories[1].items[1].price, '32.00');
  assert.deepEqual(response.body.data.categories[1].items[1].media, { thumbnail_url: 'https://cdn.test/pasta.webp', video_url: 'https://cdn.test/pasta.mp4', duration_seconds: 24.5 });
  assert.equal(response.body.data.categories[0].items[0].media, null); assert.equal(setupData.publicMenus.calls, 2);
});
test('availability filter returns only active available items and invalid values are rejected', async () => {
  const setupData = setup(); const filtered = await request(setupData.app).get(`/api/public/menu/${token}?available=true`);
  assert.equal(filtered.status, 200); assert.ok(filtered.body.data.categories.flatMap((x) => x.items).every((x) => x.is_available));
  assert.equal((await request(setupData.app).get(`/api/public/menu/${token}?available=banana`)).status, 400);
  assert.equal((await request(setupData.app).get(`/api/public/menu/${token}?unknown=true`)).status, 400);
});
test('inactive categories and items are hidden and empty categories are omitted', async () => {
  const response = await request(setup().app).get(`/api/public/menu/${token}`);
  const categoryIds = response.body.data.categories.map((x) => x.id); const itemIds = response.body.data.categories.flatMap((x) => x.items.map((item) => item.id));
  assert.ok(!categoryIds.includes(categoryHidden)); assert.ok(!categoryIds.includes(categoryEmpty)); assert.ok(!itemIds.includes(itemHidden));
});
for (const [label, overrides] of [
  ['unpublished restaurant', { published: false }], ['suspended restaurant', { restaurantStatus: 'suspended' }], ['disabled restaurant', { restaurantStatus: 'disabled' }], ['inactive table', { tableActive: false }]
]) test(`${label} returns the same public-safe not-found error`, async () => {
  const response = await request(setup(overrides).app).get(`/api/public/menu/${token}`);
  assert.equal(response.status, 404); assert.equal(response.body.error.code, 'PUBLIC_MENU_NOT_FOUND'); assert.doesNotMatch(JSON.stringify(response.body), /suspended|disabled|unpublished|inactive/i);
});
test('invalid and old QR tokens fail safely', async () => {
  const setupData = setup();
  for (const invalid of [randomUUID(), randomUUID()]) { const response = await request(setupData.app).get(`/api/public/menu/${invalid}`); assert.equal(response.status, 404); assert.equal(response.body.error.code, 'PUBLIC_MENU_NOT_FOUND'); }
  assert.equal((await request(setupData.app).get('/api/public/menu/not-a-token')).status, 400);
});
test('public response whitelists fields and never leaks internal ownership, status, QR, or storage metadata', async () => {
  const response = await request(setup().app).get(`/api/public/menu/${token}`); const json = JSON.stringify(response.body);
  for (const secret of ['owner_id', 'clerk_user_id', 'qr_token', 'video_storage_key', 'thumbnail_storage_key', 'bucket', 'restaurantStatus', 'is_published']) assert.ok(!json.includes(secret));
  assert.deepEqual(Object.keys(response.body.data.restaurant).sort(), ['cover_image_url', 'currency', 'description', 'id', 'logo_url', 'name', 'slug']);
  assert.deepEqual(Object.keys(response.body.data.table).sort(), ['code', 'id', 'name']);
});
test('public endpoint applies a safe JSON rate limit', async () => {
  const setupData = setup({ limiter: createPublicMenuLimiter({ limit: 2 }) });
  assert.equal((await request(setupData.app).get(`/api/public/menu/${token}`)).status, 200);
  assert.equal((await request(setupData.app).get(`/api/public/menu/${token}`)).status, 200);
  const limited = await request(setupData.app).get(`/api/public/menu/${token}`);
  assert.equal(limited.status, 429); assert.equal(limited.body.error.code, 'RATE_LIMITED');
});
