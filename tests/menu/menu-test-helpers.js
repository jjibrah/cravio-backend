import { randomUUID } from 'node:crypto';
import { admin, owner, testApp } from '../helpers/test-app.js';

export const ownerB = { ...owner, id: randomUUID(), clerk_user_id: 'clerk_owner_b', email: 'owner-b@cravio.test' };
export const restaurantA = { id: randomUUID(), owner_id: owner.id, name: 'Cravio A', currency: 'MYR', status: 'active', is_published: true };
export const restaurantB = { id: randomUUID(), owner_id: ownerB.id, name: 'Cravio B', currency: 'MYR', status: 'active', is_published: true };

export class MemoryRestaurants {
  constructor(rows = [restaurantA, restaurantB]) { this.rows = rows.map((row) => ({ ...row })); }
  async findByOwnerUserId(userId) { return this.rows.find((row) => row.owner_id === userId) || null; }
  async findPublishedById(id) { return this.rows.find((row) => row.id === id && row.status === 'active' && row.is_published) || null; }
}

export class MemoryMenus {
  constructor() { this.categories = []; this.items = []; }
  async createCategory(restaurantId, data) {
    const row = { id: randomUUID(), restaurant_id: restaurantId, name: data.name, description: data.description ?? null, is_active: data.is_active ?? true, display_order: this.categories.filter((x) => x.restaurant_id === restaurantId).length };
    this.categories.push(row); return row;
  }
  async listCategories(restaurantId) { return this.categories.filter((x) => x.restaurant_id === restaurantId).sort((a, b) => a.display_order - b.display_order); }
  async findCategory(id, restaurantId) { return this.categories.find((x) => x.id === id && x.restaurant_id === restaurantId) || null; }
  async updateCategory(id, restaurantId, data) { const row = await this.findCategory(id, restaurantId); if (!row) return null; Object.assign(row, data); return row; }
  async categoryItemCount(id, restaurantId) { return this.items.filter((x) => x.category_id === id && x.restaurant_id === restaurantId).length; }
  async deleteCategory(id, restaurantId) { const index = this.categories.findIndex((x) => x.id === id && x.restaurant_id === restaurantId); if (index < 0) return false; this.categories.splice(index, 1); return true; }
  async reorderCategories(restaurantId, ids) {
    const rows = this.categories.filter((x) => x.restaurant_id === restaurantId);
    if (rows.length !== ids.length || ids.some((id) => !rows.some((x) => x.id === id))) return false;
    ids.forEach((id, display_order) => { this.categories.find((x) => x.id === id).display_order = display_order; }); return true;
  }
  async createItem(restaurantId, data) {
    if (!await this.findCategory(data.category_id, restaurantId)) return null;
    const row = { id: randomUUID(), restaurant_id: restaurantId, category_id: data.category_id, name: data.name, description: data.description ?? null, price: data.price, is_available: data.is_available ?? true, is_active: data.is_active ?? true, display_order: this.items.filter((x) => x.category_id === data.category_id).length };
    this.items.push(row); return row;
  }
  async listItems(restaurantId, filters = {}) { return this.items.filter((x) => x.restaurant_id === restaurantId && (!filters.category_id || x.category_id === filters.category_id) && (filters.available === undefined || x.is_available === filters.available)).sort((a, b) => a.display_order - b.display_order); }
  async findItem(id, restaurantId) { return this.items.find((x) => x.id === id && x.restaurant_id === restaurantId) || null; }
  async updateItem(id, restaurantId, data) { const row = await this.findItem(id, restaurantId); if (!row) return null; Object.assign(row, data); return row; }
  async deactivateItem(id, restaurantId) { return this.updateItem(id, restaurantId, { is_active: false }); }
  async reorderItems(restaurantId, categoryId, ids) {
    const rows = this.items.filter((x) => x.restaurant_id === restaurantId && x.category_id === categoryId);
    if (rows.length !== ids.length || ids.some((id) => !rows.some((x) => x.id === id))) return false;
    ids.forEach((id, display_order) => { this.items.find((x) => x.id === id).display_order = display_order; }); return true;
  }
  async getPublicMenu(restaurantId) {
    return (await this.listCategories(restaurantId)).filter((c) => c.is_active).map((c) => ({ ...c, items: this.items.filter((i) => i.category_id === c.id && i.is_active).sort((a, b) => a.display_order - b.display_order) }));
  }
}

/** @param {{ authUserId?: string | null, users?: import('../helpers/test-app.js').MemoryUsers, restaurants?: MemoryRestaurants, menus?: MemoryMenus, mediaRepository?: any, mediaStorage?: any, mediaLimits?: any }} [options] */
export function menuApp(options = {}) {
  const { authUserId = owner.clerk_user_id, users, restaurants = new MemoryRestaurants(), menus = new MemoryMenus(), mediaRepository, mediaStorage, mediaLimits } = options;
  const setup = testApp({ users, authUserId, restaurantRepository: restaurants, menuRepository: menus, mediaRepository, mediaStorage, mediaLimits });
  return { ...setup, restaurants, menus };
}

export const validCategory = { name: 'Mains', description: 'Main dishes' };
export const validItem = (category_id) => ({ category_id, name: 'Nasi Lemak', description: 'Coconut rice', price: '12.50' });
export { admin, owner };
