import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { MemoryUsers, testApp } from '../helpers/test-app.js';
import { MemoryRestaurants, owner, ownerB, restaurantA, restaurantB } from '../menu/menu-test-helpers.js';

class MemoryTables {
  constructor(restaurants = [restaurantA, restaurantB]) { this.rows = []; this.restaurants = restaurants; }
  conflict(restaurantId, data, ignoreId) { return this.rows.some((x) => x.restaurant_id === restaurantId && x.id !== ignoreId && (x.name === data.name || x.code === data.code)) || this.rows.some((x) => x.qr_token === data.qrToken); }
  async create(restaurantId, data) { if (this.conflict(restaurantId, data)) { const error = /** @type {any} */ (new Error('duplicate')); error.code = '23505'; error.constraint = this.rows.some((x) => x.qr_token === data.qrToken) ? 'restaurant_tables_qr_token_key' : 'restaurant_tables_restaurant_code_key'; throw error; } const row = { id: randomUUID(), restaurant_id: restaurantId, name: data.name, code: data.code, qr_token: data.qrToken, is_active: true }; this.rows.push(row); return row; }
  async createBulk(restaurantId, entries) { const snapshot = this.rows.map((x) => ({ ...x })); try { const rows = []; for (const entry of entries) rows.push(await this.create(restaurantId, entry)); return rows; } catch (error) { this.rows = snapshot; throw error; } }
  async list(restaurantId, activeOnly = false) { return this.rows.filter((x) => x.restaurant_id === restaurantId && (!activeOnly || x.is_active)).sort((a, b) => a.code.localeCompare(b.code)); }
  async findOwned(id, restaurantId) { return this.rows.find((x) => x.id === id && x.restaurant_id === restaurantId) || null; }
  async update(id, restaurantId, data) { const row = await this.findOwned(id, restaurantId); if (!row) return null; if (this.conflict(restaurantId, data, id)) { const error = /** @type {any} */ (new Error('duplicate')); error.code = '23505'; throw error; } Object.assign(row, data); return row; }
  async deactivate(id, restaurantId) { return this.update(id, restaurantId, { is_active: false }); }
  async regenerate(id, restaurantId, token) { const row = await this.findOwned(id, restaurantId); if (!row) return null; row.qr_token = token; return row; }
  async resolve(token) { const table = this.rows.find((x) => x.qr_token === token && x.is_active); if (!table) return null; const restaurant = this.restaurants.find((x) => x.id === table.restaurant_id && x.status === 'active' && x.is_published); return restaurant ? { table_id: table.id, table_name: table.name, restaurant_id: restaurant.id, restaurant_name: restaurant.name, restaurant_slug: restaurant.slug || 'restaurant' } : null; }
}

const qr = { png: async (value) => Buffer.from(`PNG:${value}`), svg: async (value) => `<svg><text>${value}</text></svg>` };
function tableApp(options = {}) {
  const restaurants = options.restaurants || new MemoryRestaurants(); const tables = options.tables || new MemoryTables(restaurants.rows);
  const users = options.users || new MemoryUsers([owner, ownerB]);
  return { tables, restaurants, app: testApp({ users, authUserId: options.authUserId === undefined ? owner.clerk_user_id : options.authUserId, restaurantRepository: restaurants, tableRepository: tables, qrService: qr, publicAppUrl: 'https://cravio.app' }).app };
}

test('owner creates table with secure server-generated QR context', async () => {
  const setup = tableApp(); const response = await request(setup.app).post('/api/tables').send({ name: 'Table 1', code: 't01' });
  assert.equal(response.status, 201); assert.equal(response.body.data.restaurant_id, restaurantA.id); assert.match(response.body.data.qr_token, /^[0-9a-f-]{36}$/); assert.equal(response.body.data.code, 'T01'); assert.match(response.body.data.qr_url, /\/q\//);
});
test('create requires active owner and rejects client-controlled or duplicate fields', async () => {
  assert.equal((await request(tableApp({ authUserId: null }).app).post('/api/tables').send({ name: 'Table 1', code: 'T01' })).status, 401);
  for (const status of ['suspended', 'disabled']) { const users = new MemoryUsers([{ ...owner, status }]); assert.equal((await request(tableApp({ users }).app).post('/api/tables').send({ name: 'Table 1', code: 'T01' })).status, 403); }
  const setup = tableApp(); await request(setup.app).post('/api/tables').send({ name: 'Table 1', code: 'T01' });
  assert.equal((await request(setup.app).post('/api/tables').send({ name: 'Table 1', code: 'T02' })).status, 409);
  assert.equal((await request(setup.app).post('/api/tables').send({ name: 'Table 2', code: 'T02', restaurant_id: restaurantB.id, qr_token: randomUUID() })).status, 400);
});
test('owner lists, reads, safely updates, and softly deactivates own table', async () => {
  const setup = tableApp(); const table = (await request(setup.app).post('/api/tables').send({ name: 'Table 1', code: 'T01' })).body.data; const token = table.qr_token;
  assert.equal((await request(setup.app).get('/api/tables')).body.data.length, 1);
  assert.equal((await request(setup.app).get(`/api/tables/${table.id}`)).status, 200);
  const updated = await request(setup.app).patch(`/api/tables/${table.id}`).send({ name: 'Terrace 1', is_active: true }); assert.equal(updated.body.data.qr_token, token);
  assert.equal((await request(setup.app).patch(`/api/tables/${table.id}`).send({ qr_token: randomUUID() })).status, 400);
  const removed = await request(setup.app).delete(`/api/tables/${table.id}`); assert.equal(removed.body.data.is_active, false); assert.equal(setup.tables.rows.length, 1);
});
test('bulk create makes exact unique table names, codes, and tokens', async () => {
  const setup = tableApp(); const response = await request(setup.app).post('/api/tables/bulk').send({ count: 5, prefix: 'Table' });
  assert.equal(response.status, 201); assert.equal(response.body.data.length, 5); assert.equal(new Set(response.body.data.map((x) => x.name)).size, 5); assert.equal(new Set(response.body.data.map((x) => x.code)).size, 5); assert.equal(new Set(response.body.data.map((x) => x.qr_token)).size, 5);
  response.body.data.forEach((x) => assert.equal(x.restaurant_id, restaurantA.id));
});
test('bulk create validates count limits and repository rolls back all rows on conflict', async () => {
  assert.equal((await request(tableApp().app).post('/api/tables/bulk').send({ count: 0, prefix: 'Table' })).status, 400);
  assert.equal((await request(tableApp().app).post('/api/tables/bulk').send({ count: 51, prefix: 'Table' })).status, 400);
  const setup = tableApp(); await setup.tables.create(restaurantA.id, { name: 'Table 2', code: 'EXIST', qrToken: randomUUID() }); const before = setup.tables.rows.length;
  assert.equal((await request(setup.app).post('/api/tables/bulk').send({ count: 3, prefix: 'Table' })).status, 409); assert.equal(setup.tables.rows.length, before);
});
test('owner cannot read, update, deactivate, render, or regenerate foreign table', async () => {
  const setup = tableApp(); const foreign = await setup.tables.create(restaurantB.id, { name: 'Foreign', code: 'F01', qrToken: randomUUID() });
  const responses = await Promise.all([request(setup.app).get(`/api/tables/${foreign.id}`), request(setup.app).patch(`/api/tables/${foreign.id}`).send({ name: 'Stolen' }), request(setup.app).delete(`/api/tables/${foreign.id}`), request(setup.app).get(`/api/tables/${foreign.id}/qr`), request(setup.app).post(`/api/tables/${foreign.id}/qr/regenerate`)]);
  responses.forEach((response) => assert.equal(response.status, 404));
});
test('QR generation supports PNG and SVG with the correct public URL', async () => {
  const setup = tableApp(); const table = (await request(setup.app).post('/api/tables').send({ name: 'Table 1', code: 'T01' })).body.data;
  const png = await request(setup.app).get(`/api/tables/${table.id}/qr?format=png`); assert.equal(png.status, 200); assert.match(png.headers['content-type'], /image\/png/); assert.match(png.body.toString(), new RegExp(`https://cravio.app/q/${table.qr_token}`));
  const svg = await request(setup.app).get(`/api/tables/${table.id}/qr?format=svg`); assert.match(svg.headers['content-type'], /image\/svg\+xml/); assert.match(Buffer.from(svg.body).toString(), new RegExp(table.qr_token));
  assert.equal((await request(setup.app).get(`/api/tables/${table.id}/qr?format=pdf`)).status, 400);
});
test('single and bulk printable QR pages contain active table context', async () => {
  const setup = tableApp(); const table = (await request(setup.app).post('/api/tables').send({ name: 'Table 1', code: 'T01' })).body.data;
  assert.match((await request(setup.app).get(`/api/tables/${table.id}/qr/print`)).text, /Scan to view menu/);
  const bulk = await request(setup.app).get('/api/tables/qr/print'); assert.match(bulk.headers['content-type'], /text\/html/); assert.match(bulk.text, /Table 1/);
});
test('public QR resolution returns safe restaurant/table context and hides unavailable contexts', async () => {
  const setup = tableApp(); const table = (await request(setup.app).post('/api/tables').send({ name: 'Table 1', code: 'T01' })).body.data;
  const valid = await request(setup.app).get(`/api/public/qr/${table.qr_token}`); assert.equal(valid.status, 200); assert.deepEqual(Object.keys(valid.body.data.restaurant).sort(), ['id', 'name', 'slug']); assert.deepEqual(Object.keys(valid.body.data.table).sort(), ['id', 'name']);
  setup.tables.rows[0].is_active = false; assert.equal((await request(setup.app).get(`/api/public/qr/${table.qr_token}`)).status, 404);
  setup.tables.rows[0].is_active = true; setup.restaurants.rows[0].is_published = false; assert.equal((await request(setup.app).get(`/api/public/qr/${table.qr_token}`)).status, 404);
  setup.restaurants.rows[0].is_published = true; setup.restaurants.rows[0].status = 'suspended'; assert.equal((await request(setup.app).get(`/api/public/qr/${table.qr_token}`)).status, 404);
  setup.restaurants.rows[0].status = 'disabled'; assert.equal((await request(setup.app).get(`/api/public/qr/${table.qr_token}`)).status, 404);
  assert.equal((await request(setup.app).get(`/api/public/qr/${randomUUID()}`)).status, 404);
});
test('QR regeneration invalidates old token and activates new token immediately', async () => {
  const setup = tableApp(); const table = (await request(setup.app).post('/api/tables').send({ name: 'Table 1', code: 'T01' })).body.data; const old = table.qr_token;
  const regenerated = await request(setup.app).post(`/api/tables/${table.id}/qr/regenerate`); const next = regenerated.body.data.qr_token; assert.notEqual(next, old);
  assert.equal((await request(setup.app).get(`/api/public/qr/${old}`)).status, 404); assert.equal((await request(setup.app).get(`/api/public/qr/${next}`)).status, 200);
});
