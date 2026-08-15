export class PublicMenuRepository {
  constructor(db) { this.db = db; }
  async findContext(restaurantId, tableId) {
    const { rows } = await this.db.query(`SELECT r.id AS restaurant_id,r.name AS restaurant_name,r.slug,r.description,r.logo_url,r.cover_image_url,r.currency,
      t.id AS table_id,t.name AS table_name,t.code AS table_code
      FROM restaurants r JOIN restaurant_tables t ON t.restaurant_id=r.id
      WHERE r.id=$1 AND t.id=$2 AND r.status='active' AND r.is_published=TRUE AND t.is_active=TRUE`, [restaurantId, tableId]);
    return rows[0] || null;
  }
  async findMenuRows(restaurantId, availableOnly) {
    const { rows } = await this.db.query(`SELECT c.id AS category_id,c.name AS category_name,c.description AS category_description,c.display_order AS category_order,
      i.id AS item_id,i.name AS item_name,i.description AS item_description,i.price,i.is_available,i.display_order AS item_order,
      media.video_url,media.thumbnail_url
      FROM menu_categories c
      JOIN menu_items i ON i.category_id=c.id AND i.restaurant_id=c.restaurant_id AND i.is_active=TRUE
      LEFT JOIN LATERAL (
        SELECT m.video_url,m.thumbnail_url FROM media_assets m
        WHERE m.menu_item_id=i.id AND m.restaurant_id=i.restaurant_id AND m.status='ready'
        ORDER BY m.updated_at DESC LIMIT 1
      ) media ON TRUE
      WHERE c.restaurant_id=$1 AND c.is_active=TRUE AND ($2::boolean IS NULL OR i.is_available=$2)
      ORDER BY c.display_order,c.created_at,c.id,i.display_order,i.created_at,i.id`, [restaurantId, availableOnly ? true : null]);
    return rows;
  }
}
