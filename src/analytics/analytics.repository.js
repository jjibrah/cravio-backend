const eventTypes = ['MENU_VIEW', 'ITEM_IMPRESSION', 'VIDEO_OPEN', 'VIDEO_PLAY', 'VIDEO_PROGRESS', 'VIDEO_COMPLETE', 'ADD_TO_SELECTION', 'REMOVE_FROM_SELECTION', 'SHOW_WAITER'];
export { eventTypes };

export class AnalyticsRepository {
  constructor(db) { this.db = db; }
  async createSession(token, restaurantId, tableId) {
    const { rows } = await this.db.query(`INSERT INTO analytics_sessions (session_token,restaurant_id,table_id) VALUES ($1,$2,$3) RETURNING id,session_token,restaurant_id,table_id,started_at,last_seen_at`, [token, restaurantId, tableId]);
    return rows[0];
  }
  async findActiveSession(token) {
    const { rows } = await this.db.query(`SELECT s.id,s.session_token,s.restaurant_id,s.table_id FROM analytics_sessions s
      JOIN restaurants r ON r.id=s.restaurant_id JOIN restaurant_tables t ON t.id=s.table_id AND t.restaurant_id=s.restaurant_id
      WHERE s.session_token=$1 AND r.status='active' AND r.is_published=TRUE AND t.is_active=TRUE`, [token]);
    return rows[0] || null;
  }
  async findItem(itemId, restaurantId) {
    const { rows } = await this.db.query('SELECT id,category_id,restaurant_id FROM menu_items WHERE id=$1 AND restaurant_id=$2 AND is_active=TRUE', [itemId, restaurantId]);
    return rows[0] || null;
  }
  async insertEvent(session, data, item) {
    await this.db.query(`INSERT INTO analytics_events (session_id,restaurant_id,table_id,category_id,menu_item_id,event_type,watch_duration_seconds,metadata)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [session.id, session.restaurant_id, session.table_id, item?.category_id || null, item?.id || null, data.event_type, data.watch_duration_seconds ?? null, data.metadata || {}]);
    await this.db.query('UPDATE analytics_sessions SET last_seen_at=NOW() WHERE id=$1', [session.id]);
  }
  async overview(restaurantId, from, to) {
    const { rows } = await this.db.query(`SELECT COUNT(*) FILTER (WHERE event_type='MENU_VIEW')::int AS menu_views,
      COUNT(*) FILTER (WHERE event_type='ITEM_IMPRESSION')::int AS item_impressions,
      COUNT(*) FILTER (WHERE event_type='VIDEO_OPEN')::int AS video_opens,
      COUNT(*) FILTER (WHERE event_type='VIDEO_PLAY')::int AS video_plays,
      COALESCE(AVG(watch_duration_seconds) FILTER (WHERE event_type IN ('VIDEO_PROGRESS','VIDEO_COMPLETE')),0)::float AS average_watch_duration,
      COUNT(*) FILTER (WHERE event_type='ADD_TO_SELECTION')::int AS adds_to_selection,
      COUNT(*) FILTER (WHERE event_type='SHOW_WAITER')::int AS show_waiter_events,
      COUNT(DISTINCT session_id)::int AS unique_sessions
      FROM analytics_events WHERE restaurant_id=$1 AND created_at >= $2 AND created_at < $3`, [restaurantId, from, to]);
    return rows[0];
  }
  async items(restaurantId, from, to, sort) {
    const order = { video_opens: 'video_opens', selection_rate: 'selection_rate', impressions: 'impressions', adds_to_selection: 'adds_to_selection' }[sort] || 'video_opens';
    const { rows } = await this.db.query(`SELECT i.id AS item_id,i.name,c.id AS category_id,c.name AS category,
      COUNT(e.id) FILTER (WHERE e.event_type='ITEM_IMPRESSION')::int AS impressions,
      COUNT(e.id) FILTER (WHERE e.event_type='VIDEO_OPEN')::int AS video_opens,
      COUNT(e.id) FILTER (WHERE e.event_type='VIDEO_PLAY')::int AS video_plays,
      COALESCE(AVG(e.watch_duration_seconds) FILTER (WHERE e.event_type IN ('VIDEO_PROGRESS','VIDEO_COMPLETE')),0)::float AS average_watch_duration,
      COUNT(e.id) FILTER (WHERE e.event_type='ADD_TO_SELECTION')::int AS adds_to_selection,
      COUNT(e.id) FILTER (WHERE e.event_type='REMOVE_FROM_SELECTION')::int AS removes_from_selection,
      COUNT(DISTINCT e.session_id)::int AS unique_sessions,
      CASE WHEN COUNT(e.id) FILTER (WHERE e.event_type='ITEM_IMPRESSION')=0 THEN 0 ELSE COUNT(e.id) FILTER (WHERE e.event_type='VIDEO_OPEN')::float/COUNT(e.id) FILTER (WHERE e.event_type='ITEM_IMPRESSION') END AS video_open_rate,
      CASE WHEN COUNT(e.id) FILTER (WHERE e.event_type='VIDEO_OPEN')=0 THEN 0 ELSE COUNT(e.id) FILTER (WHERE e.event_type='ADD_TO_SELECTION')::float/COUNT(e.id) FILTER (WHERE e.event_type='VIDEO_OPEN') END AS selection_rate
      FROM menu_items i JOIN menu_categories c ON c.id=i.category_id
      LEFT JOIN analytics_events e ON e.menu_item_id=i.id AND e.restaurant_id=i.restaurant_id AND e.created_at >= $2 AND e.created_at < $3
      WHERE i.restaurant_id=$1 GROUP BY i.id,i.name,c.id,c.name ORDER BY ${order} DESC,i.name`, [restaurantId, from, to]);
    return rows;
  }
  async itemDetail(restaurantId, itemId, from, to) {
    const item = await this.db.query('SELECT i.id,i.name,i.description,i.price,c.id AS category_id,c.name AS category FROM menu_items i JOIN menu_categories c ON c.id=i.category_id WHERE i.id=$1 AND i.restaurant_id=$2', [itemId, restaurantId]);
    if (!item.rowCount) return null;
    const { rows } = await this.db.query(`SELECT COUNT(*) FILTER (WHERE event_type='ITEM_IMPRESSION')::int AS impressions,COUNT(*) FILTER (WHERE event_type='VIDEO_OPEN')::int AS video_opens,COUNT(*) FILTER (WHERE event_type='VIDEO_PLAY')::int AS video_plays,COUNT(*) FILTER (WHERE event_type='VIDEO_COMPLETE')::int AS video_completions,COALESCE(AVG(watch_duration_seconds) FILTER (WHERE event_type IN ('VIDEO_PROGRESS','VIDEO_COMPLETE')),0)::float AS average_watch_duration,COUNT(*) FILTER (WHERE event_type='ADD_TO_SELECTION')::int AS adds_to_selection,COUNT(*) FILTER (WHERE event_type='REMOVE_FROM_SELECTION')::int AS removes_from_selection,COUNT(DISTINCT session_id)::int AS unique_sessions FROM analytics_events WHERE restaurant_id=$1 AND menu_item_id=$2 AND created_at >= $3 AND created_at < $4`, [restaurantId, itemId, from, to]);
    const series = await this.db.query(`SELECT created_at::date AS date,COUNT(*) FILTER (WHERE event_type='ITEM_IMPRESSION')::int AS impressions,COUNT(*) FILTER (WHERE event_type='VIDEO_OPEN')::int AS video_opens,COUNT(*) FILTER (WHERE event_type='ADD_TO_SELECTION')::int AS adds_to_selection FROM analytics_events WHERE restaurant_id=$1 AND menu_item_id=$2 AND created_at >= $3 AND created_at < $4 GROUP BY created_at::date ORDER BY date`, [restaurantId, itemId, from, to]);
    return { item: item.rows[0], metrics: rows[0], performance: series.rows };
  }
  async categories(restaurantId, from, to) {
    const { rows } = await this.db.query(`SELECT c.id AS category_id,c.name,COUNT(e.id) FILTER (WHERE e.event_type='ITEM_IMPRESSION')::int AS impressions,COUNT(e.id) FILTER (WHERE e.event_type='VIDEO_OPEN')::int AS video_opens,COUNT(e.id) FILTER (WHERE e.event_type='ADD_TO_SELECTION')::int AS adds_to_selection,COUNT(DISTINCT e.session_id)::int AS unique_sessions FROM menu_categories c LEFT JOIN analytics_events e ON e.category_id=c.id AND e.restaurant_id=c.restaurant_id AND e.created_at >= $2 AND e.created_at < $3 WHERE c.restaurant_id=$1 GROUP BY c.id,c.name ORDER BY impressions DESC,c.name`, [restaurantId, from, to]); return rows;
  }
  async tables(restaurantId, from, to) {
    const { rows } = await this.db.query(`SELECT t.id AS table_id,t.name AS table_name,t.code,COUNT(DISTINCT s.id)::int AS sessions,COUNT(e.id) FILTER (WHERE e.event_type='MENU_VIEW')::int AS menu_views,COUNT(e.id) FILTER (WHERE e.event_type='VIDEO_OPEN')::int AS video_opens,COUNT(e.id) FILTER (WHERE e.event_type='ADD_TO_SELECTION')::int AS adds_to_selection,COUNT(e.id) FILTER (WHERE e.event_type='SHOW_WAITER')::int AS show_waiter_events FROM restaurant_tables t LEFT JOIN analytics_sessions s ON s.table_id=t.id AND s.restaurant_id=t.restaurant_id AND s.started_at >= $2 AND s.started_at < $3 LEFT JOIN analytics_events e ON e.session_id=s.id AND e.created_at >= $2 AND e.created_at < $3 WHERE t.restaurant_id=$1 GROUP BY t.id,t.name,t.code ORDER BY menu_views DESC,t.name`, [restaurantId, from, to]); return rows;
  }
}
