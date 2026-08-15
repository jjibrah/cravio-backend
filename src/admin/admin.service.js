import { AppError, notFound } from '../shared/errors.js';

const pages = (total, limit) => Math.ceil(total / limit);
export class AdminService {
  constructor({ admin, users }) { this.admin = admin; this.users = users; }
  async listRestaurants(query) { const result = await this.admin.listRestaurants(query); return { data: result.items, pagination: { page: query.page, limit: query.limit, total: result.total, pages: pages(result.total, query.limit) } }; }
  async getRestaurant(id) { const item = await this.admin.getRestaurant(id); if (!item) throw notFound('RESTAURANT_NOT_FOUND', 'Restaurant not found'); return item; }
  async setRestaurantStatus(adminId, id, status) { const item = await this.admin.changeRestaurantStatus(adminId, id, status); if (!item) throw notFound('RESTAURANT_NOT_FOUND', 'Restaurant not found'); return item; }
  async listOwners(query) { const result = await this.admin.listOwners(query); return { data: result.items, pagination: { page: query.page, limit: query.limit, total: result.total, pages: pages(result.total, query.limit) } }; }
  async getOwner(id) { const item = await this.admin.getOwner(id); if (!item) throw notFound('OWNER_NOT_FOUND', 'Owner not found'); return item; }
  async setOwnerStatus(adminId, id, status) { const owner = await this.admin.getOwner(id); if (!owner) throw notFound('OWNER_NOT_FOUND', 'Owner not found'); return this.admin.changeUserStatus(adminId, id, status); }
  async dashboard() { const value = await this.admin.metrics(); const result = { users: { totalOwners: value.total_owners, activeOwners: value.active_owners }, restaurants: { total: value.total_restaurants, active: value.active_restaurants, published: value.published_restaurants }, content: { menuItems: value.total_menu_items, tables: value.total_tables } }; if (value.menu_views !== undefined) result.engagement = { menuViews: value.menu_views, videoViews: value.video_views, showWaiterEvents: value.show_waiter_events }; return result; }
  async listUsers(query) { const result = await this.users.list({ limit: query.limit, offset: (query.page - 1) * query.limit }); return { ...result, page: query.page, limit: query.limit }; }
  async getUser(id) { const user = await this.users.findById(id); if (!user) throw notFound('USER_NOT_FOUND', 'User not found'); return user; }
  async setUserStatus(adminId, id, status) {
    const target = await this.getUser(id);
    if (adminId === id && status !== 'active') throw new AppError(409, 'SELF_STATUS_CHANGE_FORBIDDEN', 'Admins cannot suspend or disable themselves');
    if (target.role === 'admin' && target.status === 'active' && status !== 'active' && await this.admin.countActiveAdmins() <= 1) throw new AppError(409, 'LAST_ADMIN_PROTECTION', 'The last active admin cannot be deactivated');
    return this.admin.changeUserStatus(adminId, id, status, target.role === 'owner' ? 'OWNER_STATUS_CHANGED' : 'USER_STATUS_CHANGED');
  }
  async setUserRole(adminId, id, role) {
    const target = await this.getUser(id);
    if (adminId === id && role !== 'admin') throw new AppError(409, 'SELF_ROLE_CHANGE_FORBIDDEN', 'Admins cannot demote themselves');
    if (target.role === 'admin' && role !== 'admin' && target.status === 'active' && await this.admin.countActiveAdmins() <= 1) throw new AppError(409, 'LAST_ADMIN_PROTECTION', 'The last active admin cannot be demoted');
    return this.admin.changeUserRole(adminId, id, role);
  }
}
