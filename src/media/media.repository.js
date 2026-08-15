const fields = 'id, restaurant_id, menu_item_id, status, video_storage_key, video_url, thumbnail_storage_key, thumbnail_url, mime_type, size_bytes, duration_ms, created_at, updated_at';

export class MediaRepository {
  constructor(db) { this.db = db; }
  async createPending(restaurantId, menuItemId, key, mimeType) {
    const { rows } = await this.db.query(`INSERT INTO media_assets (restaurant_id, menu_item_id, video_storage_key, mime_type) VALUES ($1,$2,$3,$4) RETURNING ${fields}`, [restaurantId, menuItemId, key, mimeType]);
    return rows[0];
  }
  async findOwned(id, restaurantId) {
    const { rows } = await this.db.query(`SELECT ${fields} FROM media_assets WHERE id = $1 AND restaurant_id = $2 AND status <> 'deleted'`, [id, restaurantId]);
    return rows[0] || null;
  }
  async findCurrentForItem(menuItemId, restaurantId) {
    const { rows } = await this.db.query(`SELECT ${fields} FROM media_assets WHERE menu_item_id = $1 AND restaurant_id = $2 AND status = 'ready' ORDER BY updated_at DESC LIMIT 1`, [menuItemId, restaurantId]);
    return rows[0] || null;
  }
  async completeVideo(id, restaurantId, data) {
    const { rows } = await this.db.query(`UPDATE media_assets SET status='ready', video_url=$3, size_bytes=$4, duration_ms=$5, updated_at=NOW() WHERE id=$1 AND restaurant_id=$2 AND status='pending' RETURNING ${fields}`, [id, restaurantId, data.url, data.size, data.durationMs]);
    return rows[0] || null;
  }
  async setThumbnailKey(id, restaurantId, key) {
    const { rows } = await this.db.query(`UPDATE media_assets SET thumbnail_storage_key=$3, thumbnail_url=NULL, updated_at=NOW() WHERE id=$1 AND restaurant_id=$2 AND status='ready' RETURNING ${fields}`, [id, restaurantId, key]);
    return rows[0] || null;
  }
  async completeThumbnail(id, restaurantId, url) {
    const { rows } = await this.db.query(`UPDATE media_assets SET thumbnail_url=$3, updated_at=NOW() WHERE id=$1 AND restaurant_id=$2 AND status='ready' AND thumbnail_storage_key IS NOT NULL RETURNING ${fields}`, [id, restaurantId, url]);
    return rows[0] || null;
  }
  async markDeleted(id, restaurantId) {
    const { rows } = await this.db.query(`UPDATE media_assets SET status='deleted', video_url=NULL, thumbnail_url=NULL, updated_at=NOW() WHERE id=$1 AND restaurant_id=$2 AND status <> 'deleted' RETURNING ${fields}`, [id, restaurantId]);
    return rows[0] || null;
  }
}
