export class RestaurantRepository {
  constructor(db) { this.db = db; }

  async findByOwnerUserId(ownerUserId, client = this.db) {
    const { rows } = await client.query(
      `SELECT id, owner_user_id, name, currency, is_published, created_at, updated_at
       FROM restaurants WHERE owner_user_id = $1`,
      [ownerUserId]
    );
    return rows[0] || null;
  }

  async findPublishedById(id, client = this.db) {
    const { rows } = await client.query(
      `SELECT id, owner_user_id, name, currency, is_published, created_at, updated_at
       FROM restaurants WHERE id = $1 AND is_published = TRUE`,
      [id]
    );
    return rows[0] || null;
  }
}
