import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { admin, MemoryAdminRepository, MemoryUsers, owner, testApp } from '../helpers/test-app.js';

const owner2 = { ...owner, id: randomUUID(), clerk_user_id: 'clerk_owner_2', email: 'second@cravio.test', first_name: 'Second', status: 'suspended' };
const admin2 = { ...admin, id: randomUUID(), clerk_user_id: 'clerk_admin_2', email: 'admin2@cravio.test' };
const restaurant1 = { id: randomUUID(), owner_id: owner.id, name: 'Urban Fork', slug: 'urban-fork', status: 'active', is_published: true, created_at: '2026-01-02', description: 'Modern', currency: 'MYR' };
const restaurant2 = { id: randomUUID(), owner_id: owner2.id, name: 'Quiet Cafe', slug: 'quiet-cafe', status: 'suspended', is_published: false, created_at: '2026-01-01', description: 'Cafe', currency: 'MYR' };

class AdminFixture extends MemoryAdminRepository {
  constructor(users, restaurants = [restaurant1, restaurant2]) { super(users); this.restaurants = restaurants.map((x) => ({ ...x })); this.menuItems = 10; this.tables = 5; }
  ownerSummary(row) { const user = this.users.rows.find((x) => x.id === row.owner_id); return { id: user.id, email: user.email, first_name: user.first_name, last_name: user.last_name, status: user.status }; }
  async listRestaurants({ page, limit, status, published, search }) { const filtered = this.restaurants.filter((r) => (!status || r.status === status) && (published === undefined || r.is_published === published) && (!search || `${r.name} ${r.slug} ${this.ownerSummary(r).email}`.toLowerCase().includes(search.toLowerCase()))); return { items: filtered.slice((page - 1) * limit, page * limit).map((r) => ({ ...r, owner: this.ownerSummary(r) })), total: filtered.length }; }
  async getRestaurant(id) { const row = this.restaurants.find((x) => x.id === id); return row ? { ...row, owner: this.ownerSummary(row), category_count: 2, menu_item_count: 6, table_count: 3 } : null; }
  async changeRestaurantStatus(adminId, id, status) { const row = this.restaurants.find((x) => x.id === id); if (!row) return null; const old = row.status; row.status = status; this.audits.push({ admin_user_id: adminId, action: 'RESTAURANT_STATUS_CHANGED', target_type: 'restaurant', target_id: id, old_values: { status: old }, new_values: { status } }); return row; }
  async listOwners({ page, limit, status, search }) { const values = this.users.rows.filter((u) => u.role === 'owner').map((u) => ({ id: u.id, email: u.email, first_name: u.first_name, last_name: u.last_name, role: u.role, status: u.status, created_at: u.created_at, restaurant: this.restaurants.find((r) => r.owner_id === u.id) || null })).filter((u) => (!status || u.status === status) && (!search || `${u.first_name} ${u.last_name} ${u.email} ${u.restaurant?.name || ''}`.toLowerCase().includes(search.toLowerCase()))); return { items: values.slice((page - 1) * limit, page * limit), total: values.length }; }
  async getOwner(id) { const u = this.users.rows.find((value) => value.id === id && value.role === 'owner'); return u ? { id: u.id, email: u.email, first_name: u.first_name, last_name: u.last_name, role: u.role, status: u.status, created_at: u.created_at, updated_at: u.updated_at, restaurant: this.restaurants.find((r) => r.owner_id === id) || null } : null; }
  async metrics() { return { total_owners: this.users.rows.filter((u) => u.role === 'owner').length, active_owners: this.users.rows.filter((u) => u.role === 'owner' && u.status === 'active').length, total_restaurants: this.restaurants.length, active_restaurants: this.restaurants.filter((r) => r.status === 'active').length, published_restaurants: this.restaurants.filter((r) => r.is_published).length, total_menu_items: this.menuItems, total_tables: this.tables }; }
}

/** @param {{ authUserId?: string | null, users?: MemoryUsers, fixture?: AdminFixture }} [options] */
function setup(options = {}) {
  const { authUserId = admin.clerk_user_id, users = new MemoryUsers([owner, owner2, admin, admin2]), fixture } = options;
  const adminRepository = fixture || new AdminFixture(users);
  return { users, adminRepository, app: testApp({ users, authUserId, adminRepository }).app };
}

test('admin authorization denies unauthenticated, owner, suspended admin, and disabled admin', async () => {
  assert.equal((await request(setup({ authUserId: null }).app).get('/api/admin/dashboard')).status, 401);
  assert.equal((await request(setup({ authUserId: owner.clerk_user_id }).app).get('/api/admin/dashboard')).status, 403);
  for (const status of ['suspended', 'disabled']) { const users = new MemoryUsers([owner, { ...admin, status }]); assert.equal((await request(setup({ users }).app).get('/api/admin/dashboard')).status, 403); }
});
test('dashboard returns accurate basic platform metrics without fake engagement data', async () => {
  const response = await request(setup().app).get('/api/admin/dashboard');
  assert.equal(response.status, 200); assert.deepEqual(response.body.data, { users: { totalOwners: 2, activeOwners: 1 }, restaurants: { total: 2, active: 1, published: 1 }, content: { menuItems: 10, tables: 5 } }); assert.equal(response.body.data.engagement, undefined);
});
test('restaurant listing supports database-style pagination, status, published, and search filters', async () => {
  const app = setup().app;
  const filtered = await request(app).get('/api/admin/restaurants?status=active&published=true&search=urban&page=1&limit=1');
  assert.equal(filtered.status, 200); assert.equal(filtered.body.data.length, 1); assert.equal(filtered.body.pagination.total, 1); assert.equal(filtered.body.pagination.pages, 1); assert.equal(filtered.body.data[0].owner.email, owner.email);
  assert.equal((await request(app).get('/api/admin/restaurants?page=0')).status, 400); assert.equal((await request(app).get('/api/admin/restaurants?published=banana')).status, 400);
});
test('admin inspects restaurant details and changes status with an audit record', async () => {
  const setupData = setup(); const details = await request(setupData.app).get(`/api/admin/restaurants/${restaurant1.id}`);
  assert.equal(details.status, 200); assert.equal(details.body.data.menu_item_count, 6); assert.equal(details.body.data.table_count, 3); assert.equal(details.body.data.owner.clerk_user_id, undefined);
  const changed = await request(setupData.app).patch(`/api/admin/restaurants/${restaurant1.id}/status`).send({ status: 'suspended' });
  assert.equal(changed.body.data.status, 'suspended'); assert.deepEqual(setupData.adminRepository.audits[0], { admin_user_id: admin.id, action: 'RESTAURANT_STATUS_CHANGED', target_type: 'restaurant', target_id: restaurant1.id, old_values: { status: 'active' }, new_values: { status: 'suspended' } });
  const ownerApp = testApp({ users: setupData.users, authUserId: owner.clerk_user_id, adminRepository: setupData.adminRepository, restaurantRepository: { findByOwnerUserId: async () => setupData.adminRepository.restaurants.find((r) => r.owner_id === owner.id) } }).app;
  const blocked = await request(ownerApp).post('/api/menu/categories').send({ name: 'Blocked' }); assert.equal(blocked.status, 403); assert.equal(blocked.body.error.code, 'RESTAURANT_SUSPENDED');
  assert.equal((await request(setupData.app).patch(`/api/admin/restaurants/${restaurant1.id}/status`).send({ status: 'banned' })).status, 400);
});
test('owner listing and details support status/search/pagination without Clerk secrets', async () => {
  const setupData = setup(); const response = await request(setupData.app).get('/api/admin/owners?status=active&search=urban&page=1&limit=20');
  assert.equal(response.status, 200); assert.equal(response.body.data.length, 1); assert.equal(response.body.pagination.total, 1); assert.equal(response.body.data[0].restaurant.name, 'Urban Fork'); assert.equal(response.body.data[0].clerk_user_id, undefined);
  assert.equal((await request(setupData.app).get(`/api/admin/owners/${owner.id}`)).status, 200); assert.equal((await request(setupData.app).get(`/api/admin/owners/${admin.id}`)).status, 404);
});
test('owner status changes are audited and immediately block protected operations', async () => {
  const setupData = setup(); const changed = await request(setupData.app).patch(`/api/admin/owners/${owner.id}/status`).send({ status: 'suspended' });
  assert.equal(changed.body.data.status, 'suspended'); assert.equal(setupData.adminRepository.audits[0].action, 'OWNER_STATUS_CHANGED');
  const ownerApp = testApp({ users: setupData.users, authUserId: owner.clerk_user_id, adminRepository: setupData.adminRepository }).app;
  assert.equal((await request(ownerApp).patch('/api/users/me').send({ first_name: 'Blocked' })).status, 403);
});
test('admin cannot suspend, disable, or demote themselves and last active admin is protected', async () => {
  const setupData = setup();
  assert.equal((await request(setupData.app).patch(`/api/admin/users/${admin.id}/status`).send({ status: 'disabled' })).status, 409);
  assert.equal((await request(setupData.app).patch(`/api/admin/users/${admin.id}/role`).send({ role: 'owner' })).status, 409);
  const users = new MemoryUsers([owner, admin, admin2]); const single = setup({ users, authUserId: admin2.clerk_user_id });
  single.adminRepository.countActiveAdmins = async () => 1;
  assert.equal((await request(single.app).patch(`/api/admin/users/${admin.id}/role`).send({ role: 'owner' })).status, 409);
});
test('ordinary admin reads do not create audit records', async () => { const setupData = setup(); await request(setupData.app).get('/api/admin/dashboard'); await request(setupData.app).get('/api/admin/restaurants'); await request(setupData.app).get('/api/admin/owners'); assert.equal(setupData.adminRepository.audits.length, 0); });
