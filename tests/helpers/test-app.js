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

/** @param {any} [options] */
export function testApp(options = {}) {
  const { users = new MemoryUsers(), authUserId = owner.clerk_user_id, authError, webhookVerifier } = options;
  return { users, app: createApp({
    userRepository: users,
    db: { query: async () => ({ rows: [] }) },
    clerkAuthMiddleware: (_req, _res, next) => next(),
    authResolver: () => { if (authError) throw authError; return authUserId ? { isAuthenticated: true, userId: authUserId } : { isAuthenticated: false, userId: null }; },
    webhookVerifier
  }) };
}
