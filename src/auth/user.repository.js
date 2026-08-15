export class UserRepository {
  constructor(db) { this.db = db; }
  async findByClerkId(clerkId) {
    const { rows } = await this.db.query('SELECT id, clerk_user_id, email, first_name, last_name, role, status, created_at, updated_at FROM users WHERE clerk_user_id = $1', [clerkId]);
    return rows[0] || null;
  }
  async findById(id) {
    const { rows } = await this.db.query('SELECT id, clerk_user_id, email, first_name, last_name, role, status, created_at, updated_at FROM users WHERE id = $1', [id]);
    return rows[0] || null;
  }
  async list({ limit, offset }) {
    const [items, count] = await Promise.all([
      this.db.query('SELECT id, clerk_user_id, email, first_name, last_name, role, status, created_at, updated_at FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2', [limit, offset]),
      this.db.query('SELECT COUNT(*)::int AS total FROM users')
    ]);
    return { items: items.rows, total: count.rows[0].total };
  }
  async updateProfile(id, data) {
    const { rows } = await this.db.query(`UPDATE users SET first_name = COALESCE($2, first_name), last_name = COALESCE($3, last_name), updated_at = NOW() WHERE id = $1 RETURNING id, clerk_user_id, email, first_name, last_name, role, status, created_at, updated_at`, [id, data.first_name, data.last_name]);
    return rows[0] || null;
  }
  async setStatus(id, status) {
    const { rows } = await this.db.query('UPDATE users SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING id, clerk_user_id, email, first_name, last_name, role, status, created_at, updated_at', [id, status]);
    return rows[0] || null;
  }
  async setRole(id, role) {
    const { rows } = await this.db.query('UPDATE users SET role = $2, updated_at = NOW() WHERE id = $1 RETURNING id, clerk_user_id, email, first_name, last_name, role, status, created_at, updated_at', [id, role]);
    return rows[0] || null;
  }
  async upsertIdentity({ clerkUserId, email, firstName, lastName }) {
    const { rows } = await this.db.query(`INSERT INTO users (clerk_user_id, email, first_name, last_name) VALUES ($1, $2, $3, $4)
      ON CONFLICT (clerk_user_id) DO UPDATE SET email = EXCLUDED.email, first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name, updated_at = NOW()
      RETURNING id, clerk_user_id, email, first_name, last_name, role, status, created_at, updated_at`, [clerkUserId, email, firstName, lastName]);
    return rows[0];
  }
  async disableByClerkId(clerkUserId) {
    const { rows } = await this.db.query("UPDATE users SET status = 'disabled', updated_at = NOW() WHERE clerk_user_id = $1 RETURNING id", [clerkUserId]);
    return rows[0] || null;
  }
}
