const columnNames = ['id', 'owner_id', 'name', 'slug', 'description', 'logo_url', 'cover_image_url', 'phone',
  'email', 'address', 'city', 'country', 'currency', 'status', 'is_published', 'created_at', 'updated_at', 'published_at'];
const columns = columnNames.join(', ');

export class RestaurantRepository {
  constructor(db) { this.db = db; }
  async findByOwnerUserId(ownerId) { return this.findByOwnerId(ownerId); }
  async findPublishedById(id) { const restaurant = await this.findById(id); return restaurant?.status === 'active' && restaurant.is_published ? restaurant : null; }
  async findByOwnerId(ownerId) {
    const { rows } = await this.db.query(`SELECT ${columns} FROM restaurants WHERE owner_id = $1`, [ownerId]);
    return rows[0] || null;
  }
  async findById(id) {
    const { rows } = await this.db.query(`SELECT ${columns} FROM restaurants WHERE id = $1`, [id]);
    return rows[0] || null;
  }
  async findPublicBySlug(slug) {
    const { rows } = await this.db.query(`SELECT ${columns} FROM restaurants WHERE slug = $1 AND status = 'active' AND is_published = TRUE`, [slug]);
    return rows[0] || null;
  }
  async create(ownerId, slug, data) {
    const values = [ownerId, slug, data.name, data.description, data.logo_url ?? null, data.cover_image_url ?? null,
      data.phone, data.email, data.address, data.city, data.country, data.currency];
    const { rows } = await this.db.query(`INSERT INTO restaurants
      (owner_id, slug, name, description, logo_url, cover_image_url, phone, email, address, city, country, currency)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING ${columns}`, values);
    return rows[0];
  }
  async update(id, data) {
    const keys = Object.keys(data);
    const set = keys.map((key, index) => `${key} = $${index + 2}`).join(', ');
    const { rows } = await this.db.query(`UPDATE restaurants SET ${set}, updated_at = NOW() WHERE id = $1 RETURNING ${columns}`, [id, ...keys.map((key) => data[key])]);
    return rows[0] || null;
  }
  async publish(id) {
    const { rows } = await this.db.query(`UPDATE restaurants SET is_published = TRUE, published_at = COALESCE(published_at, NOW()), updated_at = NOW() WHERE id = $1 RETURNING ${columns}`, [id]);
    return rows[0];
  }
  async unpublish(id) {
    const { rows } = await this.db.query(`UPDATE restaurants SET is_published = FALSE, updated_at = NOW() WHERE id = $1 RETURNING ${columns}`, [id]);
    return rows[0];
  }
  async setStatus(id, status) {
    const { rows } = await this.db.query(`UPDATE restaurants SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING ${columns}`, [id, status]);
    return rows[0] || null;
  }
  async list({ limit, offset, status }) {
    const params = status ? [status, limit, offset] : [limit, offset];
    const where = status ? 'WHERE r.status = $1' : '';
    const limitPosition = status ? 2 : 1;
    const { rows } = await this.db.query(`SELECT ${columnNames.map((c) => `r.${c}`).join(', ')}, u.clerk_user_id AS owner_clerk_user_id
      FROM restaurants r JOIN users u ON u.id = r.owner_id ${where}
      ORDER BY r.created_at DESC LIMIT $${limitPosition} OFFSET $${limitPosition + 1}`, params);
    return rows;
  }
}
