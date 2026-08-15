const fields = 'id, restaurant_id, name, code, qr_token, is_active, created_at, updated_at';

export class TableRepository {
  constructor(db) { this.db = db; }
  async create(restaurantId, data) {
    const { rows } = await this.db.query(`INSERT INTO restaurant_tables (restaurant_id,name,code,qr_token) VALUES ($1,$2,$3,$4) RETURNING ${fields}`, [restaurantId, data.name, data.code, data.qrToken]);
    return rows[0];
  }
  async createBulk(restaurantId, entries) {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const rows = [];
      for (const entry of entries) {
        const result = await client.query(`INSERT INTO restaurant_tables (restaurant_id,name,code,qr_token) VALUES ($1,$2,$3,$4) RETURNING ${fields}`, [restaurantId, entry.name, entry.code, entry.qrToken]);
        rows.push(result.rows[0]);
      }
      await client.query('COMMIT'); return rows;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  async list(restaurantId, activeOnly = false) {
    const { rows } = await this.db.query(`SELECT ${fields} FROM restaurant_tables WHERE restaurant_id=$1${activeOnly ? ' AND is_active=TRUE' : ''} ORDER BY code,name,id`, [restaurantId]);
    return rows;
  }
  async findOwned(id, restaurantId) {
    const { rows } = await this.db.query(`SELECT ${fields} FROM restaurant_tables WHERE id=$1 AND restaurant_id=$2`, [id, restaurantId]);
    return rows[0] || null;
  }
  async update(id, restaurantId, data) {
    const keys = Object.keys(data); const values = keys.map((key) => data[key]);
    const set = keys.map((key, index) => `${key}=$${index + 1}`).join(',');
    values.push(id, restaurantId);
    const { rows } = await this.db.query(`UPDATE restaurant_tables SET ${set},updated_at=NOW() WHERE id=$${values.length - 1} AND restaurant_id=$${values.length} RETURNING ${fields}`, values);
    return rows[0] || null;
  }
  async deactivate(id, restaurantId) { return this.update(id, restaurantId, { is_active: false }); }
  async regenerate(id, restaurantId, token) {
    const { rows } = await this.db.query(`UPDATE restaurant_tables SET qr_token=$3,updated_at=NOW() WHERE id=$1 AND restaurant_id=$2 RETURNING ${fields}`, [id, restaurantId, token]);
    return rows[0] || null;
  }
  async resolve(token) {
    const { rows } = await this.db.query(`SELECT t.id AS table_id,t.name AS table_name,r.id AS restaurant_id,r.name AS restaurant_name,r.slug AS restaurant_slug
      FROM restaurant_tables t JOIN restaurants r ON r.id=t.restaurant_id
      WHERE t.qr_token=$1 AND t.is_active=TRUE AND r.status='active' AND r.is_published=TRUE`, [token]);
    return rows[0] || null;
  }
}
