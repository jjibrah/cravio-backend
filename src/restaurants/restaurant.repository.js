export class RestaurantRepository {
  constructor(db) { this.db = db; }

  async findByOwnerUserId(ownerUserId, client = this.db) {
    const { rows } = await client.query(
      `SELECT id, owner_id, name, currency, status, is_published, created_at, updated_at
       FROM restaurants WHERE owner_id = $1`,
      [ownerUserId]
    );
    return rows[0] || null;
  }

  async findPublishedById(id, client = this.db) {
    const { rows } = await client.query(
      `SELECT id, owner_id, name, currency, status, is_published, created_at, updated_at
       FROM restaurants WHERE id = $1 AND status = 'active' AND is_published = TRUE`,
      [id]
    );
    return rows[0] || null;
  }
}
