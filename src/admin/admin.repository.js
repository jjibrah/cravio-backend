export class AdminRepository {
  constructor(db) {
    this.db = db;
  }
  async listRestaurants({ page, limit, status, published, search }) {
    const values = [];
    const where = [];
    if (status) {
      values.push(status);
      where.push(`r.status=$${values.length}`);
    }
    if (published !== undefined) {
      values.push(published);
      where.push(`r.is_published=$${values.length}`);
    }
    if (search) {
      values.push(`%${search}%`);
      where.push(
        `(r.name ILIKE $${values.length} OR r.slug ILIKE $${values.length} OR u.email ILIKE $${values.length} OR concat_ws(' ',u.first_name,u.last_name) ILIKE $${values.length})`,
      );
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const offset = (page - 1) * limit;
    values.push(limit, offset);
    const limitAt = values.length - 1;
    const [items, count] = await Promise.all([
      this.db.query(
        `SELECT r.id,r.name,r.slug,r.status,r.is_published,r.created_at,
        json_build_object('id',u.id,'email',u.email,'first_name',u.first_name,'last_name',u.last_name,'status',u.status) AS owner
        FROM restaurants r JOIN users u ON u.id=r.owner_id ${clause}
        ORDER BY r.created_at DESC,r.id LIMIT $${limitAt} OFFSET $${limitAt + 1}`,
        values,
      ),
      this.db.query(
        `SELECT COUNT(*)::int AS total FROM restaurants r JOIN users u ON u.id=r.owner_id ${clause}`,
        values.slice(0, limitAt - 1),
      ),
    ]);
    return { items: items.rows, total: count.rows[0].total };
  }
  async getRestaurant(id) {
    const { rows } = await this.db.query(
      `SELECT r.id,r.name,r.slug,r.description,r.logo_url,r.cover_image_url,r.phone,r.email,r.address,r.city,r.country,r.currency,r.status,r.is_published,r.created_at,r.updated_at,r.published_at,
      json_build_object('id',u.id,'email',u.email,'first_name',u.first_name,'last_name',u.last_name,'status',u.status) AS owner,
      (SELECT COUNT(*)::int FROM menu_categories c WHERE c.restaurant_id=r.id) AS category_count,
      (SELECT COUNT(*)::int FROM menu_items i WHERE i.restaurant_id=r.id) AS menu_item_count,
      (SELECT COUNT(*)::int FROM restaurant_tables t WHERE t.restaurant_id=r.id) AS table_count
      FROM restaurants r JOIN users u ON u.id=r.owner_id WHERE r.id=$1`,
      [id],
    );
    return rows[0] || null;
  }
  async listOwners({ page, limit, status, search }) {
    const values = [];
    const where = ["u.role='owner'"];
    if (status) {
      values.push(status);
      where.push(`u.status=$${values.length}`);
    }
    if (search) {
      values.push(`%${search}%`);
      where.push(
        `(u.email ILIKE $${values.length} OR concat_ws(' ',u.first_name,u.last_name) ILIKE $${values.length} OR r.name ILIKE $${values.length})`,
      );
    }
    const clause = `WHERE ${where.join(' AND ')}`;
    const offset = (page - 1) * limit;
    values.push(limit, offset);
    const limitAt = values.length - 1;
    const [items, count] = await Promise.all([
      this.db.query(
        `SELECT u.id,u.email,u.first_name,u.last_name,u.role,u.status,u.created_at,
        CASE WHEN r.id IS NULL THEN NULL ELSE json_build_object('id',r.id,'name',r.name,'slug',r.slug,'status',r.status,'is_published',r.is_published) END AS restaurant
        FROM users u LEFT JOIN restaurants r ON r.owner_id=u.id ${clause}
        ORDER BY u.created_at DESC,u.id LIMIT $${limitAt} OFFSET $${limitAt + 1}`,
        values,
      ),
      this.db.query(
        `SELECT COUNT(*)::int AS total FROM users u LEFT JOIN restaurants r ON r.owner_id=u.id ${clause}`,
        values.slice(0, limitAt - 1),
      ),
    ]);
    return { items: items.rows, total: count.rows[0].total };
  }
  async getOwner(id) {
    const { rows } = await this.db.query(
      `SELECT u.id,u.email,u.first_name,u.last_name,u.role,u.status,u.created_at,u.updated_at,
      CASE WHEN r.id IS NULL THEN NULL ELSE json_build_object('id',r.id,'name',r.name,'slug',r.slug,'status',r.status,'is_published',r.is_published,'created_at',r.created_at) END AS restaurant
      FROM users u LEFT JOIN restaurants r ON r.owner_id=u.id WHERE u.id=$1 AND u.role='owner'`,
      [id],
    );
    return rows[0] || null;
  }
  async countActiveAdmins() {
    const { rows } = await this.db.query(
      "SELECT COUNT(*)::int AS total FROM users WHERE role='admin' AND status='active'",
    );
    return rows[0].total;
  }
  async metrics(from, to) {
    const { rows } = await this.db.query(
      `SELECT
      (SELECT COUNT(*)::int FROM users WHERE role='owner') AS total_owners,
      (SELECT COUNT(*)::int FROM users WHERE role='owner' AND status='active') AS active_owners,
      (SELECT COUNT(*)::int FROM restaurants) AS total_restaurants,
      (SELECT COUNT(*)::int FROM restaurants WHERE status='active') AS active_restaurants,
      (SELECT COUNT(*)::int FROM restaurants WHERE is_published=TRUE) AS published_restaurants,
      (SELECT COUNT(*)::int FROM menu_items) AS total_menu_items,
      (SELECT COUNT(*)::int FROM restaurant_tables) AS total_tables,
      (SELECT COUNT(*)::int FROM analytics_events WHERE event_type='MENU_VIEW' AND created_at BETWEEN $1 AND $2) AS menu_views,
      (SELECT COUNT(*)::int FROM analytics_events WHERE event_type='VIDEO_OPEN' AND created_at BETWEEN $1 AND $2) AS video_views,
      (SELECT COUNT(*)::int FROM analytics_events WHERE event_type='SHOW_WAITER' AND created_at BETWEEN $1 AND $2) AS show_waiter_events`,
      [from, to],
    );
    return rows[0];
  }
  async changeRestaurantStatus(adminId, id, status) {
    return this.changeWithAudit({
      adminId,
      table: 'restaurants',
      id,
      status,
      action: 'RESTAURANT_STATUS_CHANGED',
      targetType: 'restaurant',
    });
  }
  async changeUserStatus(adminId, id, status, action = 'OWNER_STATUS_CHANGED') {
    return this.changeWithAudit({
      adminId,
      table: 'users',
      id,
      status,
      action,
      targetType: 'user',
    });
  }
  async changeUserRole(adminId, id, role, action = 'OWNER_ROLE_CHANGED') {
    return this.changeWithAudit({ adminId, table: 'users', id, role, action, targetType: 'user' });
  }
  /** @param {{ adminId: string, table: 'users'|'restaurants', id: string, status?: string, role?: string, action: string, targetType: string }} change */
  async changeWithAudit({ adminId, table, id, status, role, action, targetType }) {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query(
        `SELECT id,status${table === 'users' ? ',role,email,first_name,last_name,created_at,updated_at,clerk_user_id' : ''} FROM ${table} WHERE id=$1 FOR UPDATE`,
        [id],
      );
      if (!current.rowCount) {
        await client.query('ROLLBACK');
        return null;
      }
      const oldRow = current.rows[0];
      const column = status !== undefined ? 'status' : 'role';
      const value = status ?? role;
      const updated = await client.query(
        `UPDATE ${table} SET ${column}=$2,updated_at=NOW() WHERE id=$1 RETURNING *`,
        [id, value],
      );
      await client.query(
        `INSERT INTO admin_audit_logs (admin_user_id,action,target_type,target_id,old_values,new_values) VALUES ($1,$2,$3,$4,$5,$6)`,
        [adminId, action, targetType, id, { [column]: oldRow[column] }, { [column]: value }],
      );
      await client.query('COMMIT');
      return updated.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
