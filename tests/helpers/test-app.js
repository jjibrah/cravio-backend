import { randomUUID } from 'node:crypto';
import { createApp } from '../../src/app.js';

export const owner = { id: randomUUID(), clerk_user_id: 'clerk_owner', email: 'owner@cravio.test', first_name: 'Dijan', last_name: 'Owner', role: 'owner', status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
export const admin = { ...owner, id: randomUUID(), clerk_user_id: 'clerk_admin', email: 'admin@cravio.test', role: 'admin' };

export class MemoryUsers {
  /** @param {any[]} [seed] */
  constructor(seed = [owner, admin]) { this.rows = seed.map((item) => ({ ...item })); }
  async findByClerkId(id) { return this.rows.find((item) => item.clerk_user_id === id) || null; }
  async findById(id) { return this.rows.find((item) => item.id === id) || null; }
  async list({ limit, offset }) { return { items: this.rows.slice(offset, offset + limit), total: this.rows.length }; }
  async updateProfile(id, data) { const row = await this.findById(id); if (!row) return null; Object.assign(row, data); return row; }
  async setStatus(id, status) { const row = await this.findById(id); if (!row) return null; row.status = status; return row; }
  async setRole(id, role) { const row = await this.findById(id); if (!row) return null; row.role = role; return row; }
  async upsertIdentity(identity) {
    let row = await this.findByClerkId(identity.clerkUserId);
    if (!row) { row = { id: randomUUID(), role: 'owner', status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }; this.rows.push(row); }
    Object.assign(row, { clerk_user_id: identity.clerkUserId, email: identity.email, first_name: identity.firstName, last_name: identity.lastName });
    return row;
  }
  async disableByClerkId(id) { const row = await this.findByClerkId(id); if (row) row.status = 'disabled'; return row; }
}

export class MemoryAdminRepository {
  constructor(users) { this.users = users; this.audits = []; }
  async countActiveAdmins() { return this.users.rows.filter((x) => x.role === 'admin' && x.status === 'active').length; }
  async changeUserStatus(adminId, id, status, action = 'OWNER_STATUS_CHANGED') { const row = await this.users.findById(id); if (!row) return null; const old = row.status; row.status = status; this.audits.push({ admin_user_id: adminId, action, target_type: 'user', target_id: id, old_values: { status: old }, new_values: { status } }); return row; }
  async changeUserRole(adminId, id, role) { const row = await this.users.findById(id); if (!row) return null; const old = row.role; row.role = role; this.audits.push({ admin_user_id: adminId, action: 'OWNER_ROLE_CHANGED', target_type: 'user', target_id: id, old_values: { role: old }, new_values: { role } }); return row; }
  async getOwner(id) { const row = await this.users.findById(id); return row?.role === 'owner' ? { ...row, restaurant: null } : null; }
  async listOwners({ page, limit, status, search }) { const filtered = this.users.rows.filter((x) => x.role === 'owner' && (!status || x.status === status) && (!search || `${x.first_name} ${x.last_name} ${x.email}`.toLowerCase().includes(search.toLowerCase()))); return { items: filtered.slice((page - 1) * limit, page * limit), total: filtered.length }; }
  async metrics() { return { total_owners: this.users.rows.filter((x) => x.role === 'owner').length, active_owners: this.users.rows.filter((x) => x.role === 'owner' && x.status === 'active').length, total_restaurants: 0, active_restaurants: 0, published_restaurants: 0, total_menu_items: 0, total_tables: 0 }; }
  async listRestaurants() { return { items: [], total: 0 }; }
  async getRestaurant() { return null; }
  async changeRestaurantStatus() { return null; }
}

/** @param {any} [options] */
export function testApp(options = {}) {
  const {
    users = new MemoryUsers(), authUserId = owner.clerk_user_id, authError, webhookVerifier,
    restaurantRepository, menuRepository, mediaRepository, mediaStorage, mediaLimits,
    tableRepository, qrService, publicAppUrl, publicMenuRepository, publicMenuLimiter,
    clerkMiddleware, adminRepository, analyticsRepository, analyticsLimiters
  } = options;
  const adminData = adminRepository || new MemoryAdminRepository(users);
  return { users, app: createApp({
    userRepository: users,
    db: { query: async () => ({ rows: [] }) },
    clerkAuthMiddleware: clerkMiddleware || ((_req, _res, next) => next()),
    authResolver: () => { if (authError) throw authError; return authUserId ? { isAuthenticated: true, userId: authUserId } : { isAuthenticated: false, userId: null }; },
    webhookVerifier,
    restaurantRepository,
    menuRepository,
    mediaRepository,
    mediaStorage,
    mediaLimits,
    tableRepository,
    qrService,
    publicAppUrl,
    publicMenuRepository,
    publicMenuLimiter,
    adminRepository: adminData,
    analyticsRepository,
    analyticsLimiters
  }) };
}
