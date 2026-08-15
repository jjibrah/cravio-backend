import { AppError } from '../shared/errors.js';

const unavailable = () => new AppError(404, 'PUBLIC_MENU_NOT_FOUND', 'Public menu is not available');

export class PublicMenuService {
  constructor({ publicMenus, tables }) { this.publicMenus = publicMenus; this.tables = tables; }
  shapeCategories(rows) {
    const categories = []; const byId = new Map();
    for (const row of rows) {
      let category = byId.get(row.category_id);
      if (!category) {
        category = { id: row.category_id, name: row.category_name, description: row.category_description, display_order: row.category_order, items: [] };
        byId.set(row.category_id, category); categories.push(category);
      }
      category.items.push({
        id: row.item_id, name: row.item_name, description: row.item_description, price: row.price,
        is_available: row.is_available, display_order: row.item_order,
        media: row.video_url || row.thumbnail_url ? { thumbnail_url: row.thumbnail_url || null, video_url: row.video_url || null, duration_seconds: row.duration_seconds === undefined ? null : Number(row.duration_seconds) } : null
      });
    }
    return categories;
  }
  async getByQrToken(token, availableOnly = false) {
    let qr;
    try { qr = await this.tables.resolveQrToken(token); }
    catch (error) { if (error instanceof AppError && error.status === 404) throw unavailable(); throw error; }
    const context = await this.publicMenus.findContext(qr.restaurant.id, qr.table.id);
    if (!context) throw unavailable();
    const rows = await this.publicMenus.findMenuRows(context.restaurant_id, availableOnly);
    return {
      restaurant: { id: context.restaurant_id, name: context.restaurant_name, slug: context.slug, description: context.description, logo_url: context.logo_url, cover_image_url: context.cover_image_url, currency: context.currency },
      table: { id: context.table_id, name: context.table_name, code: context.table_code },
      categories: this.shapeCategories(rows)
    };
  }
}
