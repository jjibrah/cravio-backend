export class MenuRepository {
  constructor(db) {
    this.db = db;
  }

  async withTransaction(work) {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async createCategory(restaurantId, data) {
    return this.withTransaction(async (client) => {
      await client.query('SELECT id FROM restaurants WHERE id = $1 FOR UPDATE', [restaurantId]);
      const { rows } = await client.query(
        `INSERT INTO menu_categories (restaurant_id, name, description, display_order, is_active)
         VALUES ($1, $2, $3, (SELECT COALESCE(MAX(display_order), -1) + 1 FROM menu_categories WHERE restaurant_id = $1), $4)
         RETURNING *`,
        [restaurantId, data.name, data.description ?? null, data.is_active ?? true],
      );
      return rows[0];
    });
  }

  async listCategories(restaurantId, client = this.db) {
    const { rows } = await client.query(
      'SELECT * FROM menu_categories WHERE restaurant_id = $1 ORDER BY display_order, created_at, id',
      [restaurantId],
    );
    return rows;
  }

  async findCategory(id, restaurantId, client = this.db) {
    const { rows } = await client.query(
      'SELECT * FROM menu_categories WHERE id = $1 AND restaurant_id = $2',
      [id, restaurantId],
    );
    return rows[0] || null;
  }

  async updateCategory(id, restaurantId, data) {
    const fields = [];
    const values = [];
    for (const key of ['name', 'description', 'is_active'])
      if (key in data) {
        values.push(data[key]);
        fields.push(`${key} = $${values.length}`);
      }
    values.push(id, restaurantId);
    const { rows } = await this.db.query(
      `UPDATE menu_categories SET ${fields.join(', ')}, updated_at = NOW()
       WHERE id = $${values.length - 1} AND restaurant_id = $${values.length} RETURNING *`,
      values,
    );
    return rows[0] || null;
  }

  async categoryItemCount(id, restaurantId, client = this.db) {
    const { rows } = await client.query(
      'SELECT COUNT(*)::int AS count FROM menu_items WHERE category_id = $1 AND restaurant_id = $2',
      [id, restaurantId],
    );
    return rows[0].count;
  }

  async deleteCategory(id, restaurantId) {
    const { rowCount } = await this.db.query(
      'DELETE FROM menu_categories WHERE id = $1 AND restaurant_id = $2',
      [id, restaurantId],
    );
    return rowCount > 0;
  }

  async reorderCategories(restaurantId, ids) {
    return this.withTransaction(async (client) => {
      const current = await client.query(
        'SELECT id FROM menu_categories WHERE restaurant_id = $1 FOR UPDATE',
        [restaurantId],
      );
      const currentIds = current.rows.map((row) => row.id);
      if (currentIds.length !== ids.length || ids.some((id) => !currentIds.includes(id)))
        return false;
      await client.query(
        `UPDATE menu_categories c SET display_order = ordered.position - 1, updated_at = NOW()
         FROM unnest($1::uuid[]) WITH ORDINALITY AS ordered(id, position)
         WHERE c.id = ordered.id AND c.restaurant_id = $2`,
        [ids, restaurantId],
      );
      return true;
    });
  }

  async createItem(restaurantId, data) {
    return this.withTransaction(async (client) => {
      const category = await client.query(
        'SELECT id FROM menu_categories WHERE id = $1 AND restaurant_id = $2 FOR UPDATE',
        [data.category_id, restaurantId],
      );
      if (!category.rowCount) return null;
      const { rows } = await client.query(
        `INSERT INTO menu_items (restaurant_id, category_id, name, description, price, display_order, is_available, is_active)
         VALUES ($1, $2, $3, $4, $5, (SELECT COALESCE(MAX(display_order), -1) + 1 FROM menu_items WHERE category_id = $2), $6, $7)
         RETURNING *`,
        [
          restaurantId,
          data.category_id,
          data.name,
          data.description ?? null,
          data.price,
          data.is_available ?? true,
          data.is_active ?? true,
        ],
      );
      return rows[0];
    });
  }

  async listItems(restaurantId, filters = {}, client = this.db) {
    const values = [restaurantId];
    const clauses = ['restaurant_id = $1'];
    if (filters.category_id) {
      values.push(filters.category_id);
      clauses.push(`category_id = $${values.length}`);
    }
    if (filters.available !== undefined) {
      values.push(filters.available);
      clauses.push(`is_available = $${values.length}`);
    }
    const { rows } = await client.query(
      `SELECT * FROM menu_items WHERE ${clauses.join(' AND ')} ORDER BY category_id, display_order, created_at, id`,
      values,
    );
    return rows;
  }

  async findItem(id, restaurantId, client = this.db) {
    const { rows } = await client.query(
      'SELECT * FROM menu_items WHERE id = $1 AND restaurant_id = $2',
      [id, restaurantId],
    );
    return rows[0] || null;
  }

  async updateItem(id, restaurantId, data) {
    const fields = [];
    const values = [];
    for (const key of [
      'category_id',
      'name',
      'description',
      'price',
      'is_available',
      'is_active',
    ]) {
      if (key in data) {
        values.push(data[key]);
        fields.push(`${key} = $${values.length}`);
      }
    }
    values.push(id, restaurantId);
    const { rows } = await this.db.query(
      `UPDATE menu_items SET ${fields.join(', ')}, updated_at = NOW()
       WHERE id = $${values.length - 1} AND restaurant_id = $${values.length} RETURNING *`,
      values,
    );
    return rows[0] || null;
  }

  async deactivateItem(id, restaurantId) {
    const { rows } = await this.db.query(
      'UPDATE menu_items SET is_active = FALSE, updated_at = NOW() WHERE id = $1 AND restaurant_id = $2 RETURNING *',
      [id, restaurantId],
    );
    return rows[0] || null;
  }

  async reorderItems(restaurantId, categoryId, ids) {
    return this.withTransaction(async (client) => {
      const current = await client.query(
        'SELECT id FROM menu_items WHERE restaurant_id = $1 AND category_id = $2 FOR UPDATE',
        [restaurantId, categoryId],
      );
      const currentIds = current.rows.map((row) => row.id);
      if (currentIds.length !== ids.length || ids.some((id) => !currentIds.includes(id)))
        return false;
      await client.query(
        `UPDATE menu_items i SET display_order = ordered.position - 1, updated_at = NOW()
         FROM unnest($1::uuid[]) WITH ORDINALITY AS ordered(id, position)
         WHERE i.id = ordered.id AND i.restaurant_id = $2 AND i.category_id = $3`,
        [ids, restaurantId, categoryId],
      );
      return true;
    });
  }

  async getPublicMenu(restaurantId) {
    const { rows } = await this.db.query(
      `SELECT c.id AS category_id, c.name AS category_name, c.description AS category_description,
              c.display_order AS category_display_order,
              COALESCE(json_agg(json_build_object(
                'id', i.id, 'name', i.name, 'description', i.description, 'price', i.price,
                'is_available', i.is_available, 'display_order', i.display_order
              ) ORDER BY i.display_order, i.created_at, i.id) FILTER (WHERE i.id IS NOT NULL), '[]') AS items
       FROM menu_categories c
       LEFT JOIN menu_items i ON i.category_id = c.id AND i.restaurant_id = c.restaurant_id AND i.is_active = TRUE
       WHERE c.restaurant_id = $1 AND c.is_active = TRUE
       GROUP BY c.id ORDER BY c.display_order, c.created_at, c.id`,
      [restaurantId],
    );
    return rows;
  }
}
