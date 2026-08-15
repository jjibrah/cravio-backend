import { randomUUID } from 'node:crypto';

import { AppError, notFound } from '../shared/errors.js';

const itemEvents = new Set([
  'ITEM_IMPRESSION',
  'VIDEO_OPEN',
  'VIDEO_PLAY',
  'VIDEO_PROGRESS',
  'VIDEO_COMPLETE',
  'ADD_TO_SELECTION',
  'REMOVE_FROM_SELECTION',
]);
const durationEvents = new Set(['VIDEO_PROGRESS', 'VIDEO_COMPLETE']);
const ratio = (a, b) => (b ? a / b : 0);

export class AnalyticsService {
  constructor({ analytics, tables, restaurants }) {
    this.analytics = analytics;
    this.tables = tables;
    this.restaurants = restaurants;
  }
  async createSession(qrToken) {
    let context;
    try {
      context = await this.tables.resolveQrToken(qrToken);
    } catch (error) {
      if (error instanceof AppError && error.status === 404)
        throw notFound('ANALYTICS_CONTEXT_NOT_FOUND', 'Analytics context is not available');
      throw error;
    }
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const session = await this.analytics.createSession(
          randomUUID(),
          context.restaurant.id,
          context.table.id,
        );
        return { session_id: session.session_token };
      } catch (error) {
        if (error?.code !== '23505' || error?.constraint !== 'analytics_sessions_session_token_key')
          throw error;
      }
    }
    throw new AppError(500, 'ANALYTICS_SESSION_FAILED', 'Could not create analytics session');
  }
  async record(data) {
    const session = await this.analytics.findActiveSession(data.session_id);
    if (!session)
      throw notFound('ANALYTICS_SESSION_NOT_FOUND', 'Analytics session is not available');
    let item = null;
    if (itemEvents.has(data.event_type)) {
      if (!data.menu_item_id)
        throw new AppError(400, 'MENU_ITEM_REQUIRED', 'This event requires a menu item');
      item = await this.analytics.findItem(data.menu_item_id, session.restaurant_id);
      if (!item)
        throw new AppError(400, 'INVALID_MENU_ITEM', 'Menu item is invalid for this session');
    } else if (data.menu_item_id)
      throw new AppError(400, 'MENU_ITEM_NOT_ALLOWED', 'This event does not accept a menu item');
    if (durationEvents.has(data.event_type) && data.watch_duration_seconds === undefined)
      throw new AppError(400, 'WATCH_DURATION_REQUIRED', 'Watch duration is required');
    if (!durationEvents.has(data.event_type) && data.watch_duration_seconds !== undefined)
      throw new AppError(
        400,
        'WATCH_DURATION_NOT_ALLOWED',
        'Watch duration is not allowed for this event',
      );
    if (data.metadata?.selected_item_count !== undefined && data.event_type !== 'SHOW_WAITER')
      throw new AppError(
        400,
        'INVALID_EVENT_METADATA',
        'selected_item_count is only valid for SHOW_WAITER',
      );
    if (data.metadata?.video_progress_percent !== undefined && !durationEvents.has(data.event_type))
      throw new AppError(
        400,
        'INVALID_EVENT_METADATA',
        'video_progress_percent is only valid for video progress events',
      );
    await this.analytics.insertEvent(session, data, item);
    return { success: true };
  }
  range(query) {
    const today = new Date();
    const toDate = query.to
      ? new Date(`${query.to}T00:00:00.000Z`)
      : new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const fromDate = query.from
      ? new Date(`${query.from}T00:00:00.000Z`)
      : new Date(toDate.getTime() - 29 * 86400000);
    if (fromDate > toDate)
      throw new AppError(400, 'INVALID_DATE_RANGE', 'from must be on or before to');
    if ((toDate.getTime() - fromDate.getTime()) / 86400000 > 365)
      throw new AppError(400, 'INVALID_DATE_RANGE', 'Date range cannot exceed 365 days');
    return {
      from: fromDate,
      to: new Date(toDate.getTime() + 86400000),
      fromDate: fromDate.toISOString().slice(0, 10),
      toDate: toDate.toISOString().slice(0, 10),
    };
  }
  async ownerContext(userId, query) {
    const restaurant = await this.restaurants.findByOwnerUserId(userId);
    if (!restaurant) throw notFound('RESTAURANT_NOT_FOUND', 'Restaurant not found');
    if (restaurant.status !== 'active')
      throw new AppError(403, 'RESTAURANT_INACTIVE', 'Restaurant is not active');
    return { restaurant, range: this.range(query) };
  }
  async overview(userId, query) {
    const { restaurant, range } = await this.ownerContext(userId, query);
    const m = await this.analytics.overview(restaurant.id, range.from, range.to);
    return {
      range: { from: range.fromDate, to: range.toDate },
      metrics: {
        ...m,
        video_open_rate: ratio(m.video_opens, m.item_impressions),
        selection_rate: ratio(m.adds_to_selection, m.video_opens),
        show_waiter_rate: ratio(m.show_waiter_events, m.menu_views),
      },
    };
  }
  async items(userId, query) {
    const { restaurant, range } = await this.ownerContext(userId, query);
    return {
      range: { from: range.fromDate, to: range.toDate },
      items: await this.analytics.items(restaurant.id, range.from, range.to, query.sort),
    };
  }
  async item(userId, id, query) {
    const { restaurant, range } = await this.ownerContext(userId, query);
    const result = await this.analytics.itemDetail(restaurant.id, id, range.from, range.to);
    if (!result) throw notFound('MENU_ITEM_NOT_FOUND', 'Menu item not found');
    result.metrics.video_open_rate = ratio(result.metrics.video_opens, result.metrics.impressions);
    result.metrics.selection_rate = ratio(
      result.metrics.adds_to_selection,
      result.metrics.video_opens,
    );
    return { range: { from: range.fromDate, to: range.toDate }, ...result };
  }
  async categories(userId, query) {
    const { restaurant, range } = await this.ownerContext(userId, query);
    return {
      range: { from: range.fromDate, to: range.toDate },
      categories: await this.analytics.categories(restaurant.id, range.from, range.to),
    };
  }
  async tableReport(userId, query) {
    const { restaurant, range } = await this.ownerContext(userId, query);
    return {
      range: { from: range.fromDate, to: range.toDate },
      tables: await this.analytics.tables(restaurant.id, range.from, range.to),
    };
  }
}
