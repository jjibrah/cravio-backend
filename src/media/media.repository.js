const fields = 'id, restaurant_id, menu_item_id, media_type, status, video_storage_key, video_url, thumbnail_storage_key, thumbnail_url, original_filename, mime_type, size_bytes, duration_seconds, width, height, created_at, updated_at';

export class MediaRepository {
  constructor(db) { this.db = db; }
  async createPending(restaurantId, menuItemId, key, mimeType, originalFilename = null) { const { rows } = await this.db.query(`INSERT INTO media_assets (restaurant_id,menu_item_id,video_storage_key,mime_type,original_filename) VALUES ($1,$2,$3,$4,$5) RETURNING ${fields}`, [restaurantId, menuItemId, key, mimeType, originalFilename]); return rows[0]; }
  async findOwned(id, restaurantId) { const { rows } = await this.db.query(`SELECT ${fields} FROM media_assets WHERE id=$1 AND restaurant_id=$2 AND status <> 'deleted'`, [id, restaurantId]); return rows[0] || null; }
  async findCurrentForItem(menuItemId, restaurantId) { const { rows } = await this.db.query(`SELECT ${fields} FROM media_assets WHERE menu_item_id=$1 AND restaurant_id=$2 AND status='ready' LIMIT 1`, [menuItemId, restaurantId]); return rows[0] || null; }
  async finalizeReplacement(id, restaurantId, data) {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const pending = await client.query(`SELECT ${fields} FROM media_assets WHERE id=$1 AND restaurant_id=$2 AND status='processing' FOR UPDATE`, [id, restaurantId]);
      if (!pending.rowCount) { await client.query('ROLLBACK'); return null; }
      const current = await client.query(`SELECT ${fields} FROM media_assets WHERE menu_item_id=$1 AND restaurant_id=$2 AND status='ready' FOR UPDATE`, [pending.rows[0].menu_item_id, restaurantId]);
      if (current.rowCount) await client.query("UPDATE media_assets SET status='deleted',video_url=NULL,thumbnail_url=NULL,updated_at=NOW() WHERE id=$1", [current.rows[0].id]);
      const updated = await client.query(`UPDATE media_assets SET status='ready',video_url=$3,thumbnail_storage_key=$4,thumbnail_url=$5,size_bytes=$6,duration_seconds=$7,width=$8,height=$9,updated_at=NOW() WHERE id=$1 AND restaurant_id=$2 RETURNING ${fields}`, [id, restaurantId, data.videoUrl, data.thumbnailKey, data.thumbnailUrl, data.size, data.durationSeconds, data.width, data.height]);
      await client.query('COMMIT'); return { asset: updated.rows[0], previous: current.rows[0] || null };
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  async markFailed(id, restaurantId) { const { rows } = await this.db.query(`UPDATE media_assets SET status='failed',video_url=NULL,thumbnail_url=NULL,updated_at=NOW() WHERE id=$1 AND restaurant_id=$2 AND status='processing' RETURNING ${fields}`, [id, restaurantId]); return rows[0] || null; }
  async setThumbnailKey(id, restaurantId, key) { const { rows } = await this.db.query(`UPDATE media_assets SET thumbnail_storage_key=$3,thumbnail_url=NULL,updated_at=NOW() WHERE id=$1 AND restaurant_id=$2 AND status='ready' RETURNING ${fields}`, [id, restaurantId, key]); return rows[0] || null; }
  async completeThumbnail(id, restaurantId, url) { const { rows } = await this.db.query(`UPDATE media_assets SET thumbnail_url=$3,updated_at=NOW() WHERE id=$1 AND restaurant_id=$2 AND status='ready' AND thumbnail_storage_key IS NOT NULL RETURNING ${fields}`, [id, restaurantId, url]); return rows[0] || null; }
  async markDeleted(id, restaurantId) { const { rows } = await this.db.query(`UPDATE media_assets SET status='deleted',video_url=NULL,thumbnail_url=NULL,updated_at=NOW() WHERE id=$1 AND restaurant_id=$2 AND status <> 'deleted' RETURNING ${fields}`, [id, restaurantId]); return rows[0] || null; }
}
