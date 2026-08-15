import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import request from 'supertest';

import { eventTypes } from '../../src/analytics/analytics.repository.js';
import { AnalyticsRepository } from '../../src/analytics/analytics.repository.js';
import { createAnalyticsLimiters } from '../../src/analytics/analytics.routes.js';
import { owner, testApp } from '../helpers/test-app.js';

const restaurantA = randomUUID();
const restaurantB = randomUUID();
const tableA = randomUUID();
const categoryA = randomUUID();
const itemA = randomUUID();
const itemB = randomUUID();
const qr = randomUUID();
const noop = (_req, _res, next) => next();

class AnalyticsMemory {
  constructor() {
    this.sessions = [];
    this.events = [];
    this.itemsData = [
      {
        id: itemA,
        restaurant_id: restaurantA,
        category_id: categoryA,
        name: 'Pasta',
        category_name: 'Mains',
      },
      {
        id: itemB,
        restaurant_id: restaurantB,
        category_id: randomUUID(),
        name: 'Foreign',
        category_name: 'Other',
      },
    ];
  }
  async createSession(token, restaurantId, tableId) {
    const row = {
      id: randomUUID(),
      session_token: token,
      restaurant_id: restaurantId,
      table_id: tableId,
    };
    this.sessions.push(row);
    return row;
  }
  async findActiveSession(token) {
    return this.sessions.find((x) => x.session_token === token) || null;
  }
  async findItem(id, restaurantId) {
    return this.itemsData.find((x) => x.id === id && x.restaurant_id === restaurantId) || null;
  }
  async insertEvent(session, data, item) {
    this.events.push({
      id: randomUUID(),
      session_id: session.id,
      restaurant_id: session.restaurant_id,
      table_id: session.table_id,
      category_id: item?.category_id || null,
      menu_item_id: item?.id || null,
      event_type: data.event_type,
      watch_duration_seconds: data.watch_duration_seconds ?? null,
      metadata: data.metadata || {},
      created_at: new Date(),
    });
  }
  filtered(rid, from, to) {
    return this.events.filter(
      (x) => x.restaurant_id === rid && x.created_at >= from && x.created_at < to,
    );
  }
  async overview(rid, from, to) {
    const rows = this.filtered(rid, from, to);
    const count = (type) => rows.filter((x) => x.event_type === type).length;
    const durations = rows.filter((x) => x.watch_duration_seconds !== null);
    return {
      menu_views: count('MENU_VIEW'),
      item_impressions: count('ITEM_IMPRESSION'),
      video_opens: count('VIDEO_OPEN'),
      video_plays: count('VIDEO_PLAY'),
      average_watch_duration: durations.length
        ? durations.reduce((n, x) => n + x.watch_duration_seconds, 0) / durations.length
        : 0,
      adds_to_selection: count('ADD_TO_SELECTION'),
      show_waiter_events: count('SHOW_WAITER'),
      unique_sessions: new Set(rows.map((x) => x.session_id)).size,
    };
  }
  metrics(rows) {
    const count = (type) => rows.filter((x) => x.event_type === type).length;
    const durations = rows.filter((x) => x.watch_duration_seconds !== null);
    return {
      impressions: count('ITEM_IMPRESSION'),
      video_opens: count('VIDEO_OPEN'),
      video_plays: count('VIDEO_PLAY'),
      video_completions: count('VIDEO_COMPLETE'),
      average_watch_duration: durations.length
        ? durations.reduce((n, x) => n + x.watch_duration_seconds, 0) / durations.length
        : 0,
      adds_to_selection: count('ADD_TO_SELECTION'),
      removes_from_selection: count('REMOVE_FROM_SELECTION'),
      unique_sessions: new Set(rows.map((x) => x.session_id)).size,
    };
  }
  async items(rid, from, to, sort) {
    const rows = this.filtered(rid, from, to);
    return this.itemsData
      .filter((x) => x.restaurant_id === rid)
      .map((item) => {
        const metrics = this.metrics(rows.filter((x) => x.menu_item_id === item.id));
        return {
          item_id: item.id,
          name: item.name,
          category: item.category_name,
          ...metrics,
          video_open_rate: metrics.impressions ? metrics.video_opens / metrics.impressions : 0,
          selection_rate: metrics.video_opens ? metrics.adds_to_selection / metrics.video_opens : 0,
        };
      })
      .sort((a, b) => b[sort] - a[sort]);
  }
  async itemDetail(rid, id, from, to) {
    const item = this.itemsData.find((x) => x.id === id && x.restaurant_id === rid);
    return item
      ? {
          item: { id: item.id, name: item.name, category: item.category_name },
          metrics: this.metrics(this.filtered(rid, from, to).filter((x) => x.menu_item_id === id)),
        }
      : null;
  }
  async categories(rid, from, to) {
    const rows = this.filtered(rid, from, to).filter((x) => x.category_id === categoryA);
    const m = this.metrics(rows);
    return [
      {
        category_id: categoryA,
        name: 'Mains',
        impressions: m.impressions,
        video_opens: m.video_opens,
        adds_to_selection: m.adds_to_selection,
        unique_sessions: m.unique_sessions,
      },
    ];
  }
  async tables(rid, from, to) {
    const rows = this.filtered(rid, from, to);
    const count = (type) => rows.filter((x) => x.event_type === type).length;
    return [
      {
        table_id: tableA,
        table_name: 'Table 1',
        sessions: new Set(rows.map((x) => x.session_id)).size,
        menu_views: count('MENU_VIEW'),
        video_opens: count('VIDEO_OPEN'),
        adds_to_selection: count('ADD_TO_SELECTION'),
        show_waiter_events: count('SHOW_WAITER'),
      },
    ];
  }
}

function setup(options = {}) {
  const analytics = new AnalyticsMemory();
  let clerkCalls = 0;
  const state = { visible: true, ...options };
  const app = testApp({
    analyticsRepository: analytics,
    analyticsLimiters: options.limits || { sessions: noop, events: noop },
    restaurantRepository: {
      findByOwnerUserId: async (id) =>
        id === owner.id
          ? { id: restaurantA, status: 'active' }
          : { id: restaurantB, status: 'active' },
    },
    tableRepository: {
      resolve: async (token) =>
        state.visible && token === qr
          ? {
              restaurant_id: restaurantA,
              restaurant_name: 'Urban Fork',
              restaurant_slug: 'urban-fork',
              table_id: tableA,
              table_name: 'Table 1',
            }
          : null,
    },
    clerkMiddleware: (_req, _res, next) => {
      clerkCalls += 1;
      next();
    },
  }).app;
  return { app, analytics, clerkCalls: () => clerkCalls };
}

async function session(app) {
  const response = await request(app).post('/api/public/analytics/session').send({ qr_token: qr });
  assert.equal(response.status, 201);
  return response.body.data.session_id;
}
async function event(app, sessionId, event_type, extra = {}) {
  return request(app)
    .post('/api/public/analytics/events')
    .send({ session_id: sessionId, event_type, ...extra });
}

test('valid QR creates unique anonymous sessions without invoking Clerk', async () => {
  const x = setup();
  const first = await session(x.app);
  const second = await session(x.app);
  assert.notEqual(first, second);
  assert.equal(x.analytics.sessions.length, 2);
  assert.equal(x.clerkCalls(), 0);
});
test('invalid, inactive, or unpublished QR context fails with the same public-safe error', async () => {
  const response = await request(setup({ visible: false }).app)
    .post('/api/public/analytics/session')
    .send({ qr_token: qr });
  assert.equal(response.status, 404);
  assert.equal(response.body.error.code, 'ANALYTICS_CONTEXT_NOT_FOUND');
});

test('all supported event types are accepted and stored with server-derived context', async () => {
  const x = setup();
  const sid = await session(x.app);
  for (const type of eventTypes) {
    const itemEvent = !['MENU_VIEW', 'SHOW_WAITER'].includes(type);
    const extra = itemEvent ? { menu_item_id: itemA } : {};
    if (['VIDEO_PROGRESS', 'VIDEO_COMPLETE'].includes(type)) extra.watch_duration_seconds = 12;
    if (type === 'SHOW_WAITER') extra.metadata = { selected_item_count: 3 };
    const response = await event(x.app, sid, type, extra);
    assert.equal(response.status, 202, type);
  }
  assert.equal(x.analytics.events.length, eventTypes.length);
  assert.ok(
    x.analytics.events.every((x) => x.restaurant_id === restaurantA && x.table_id === tableA),
  );
});

test('event validation rejects unknown types, sessions, foreign items, duration misuse, metadata misuse, and unknown fields', async () => {
  const x = setup();
  const sid = await session(x.app);
  assert.equal((await event(x.app, sid, 'BANANA')).status, 400);
  assert.equal((await event(x.app, randomUUID(), 'MENU_VIEW')).status, 404);
  assert.equal((await event(x.app, sid, 'VIDEO_OPEN', { menu_item_id: itemB })).status, 400);
  assert.equal(
    (
      await event(x.app, sid, 'VIDEO_PROGRESS', {
        menu_item_id: itemA,
        watch_duration_seconds: 121,
      })
    ).status,
    400,
  );
  assert.equal((await event(x.app, sid, 'VIDEO_PROGRESS', { menu_item_id: itemA })).status, 400);
  assert.equal((await event(x.app, sid, 'MENU_VIEW', { watch_duration_seconds: 2 })).status, 400);
  assert.equal(
    (
      await event(x.app, sid, 'VIDEO_OPEN', {
        menu_item_id: itemA,
        metadata: { selected_item_count: 2 },
      })
    ).status,
    400,
  );
  assert.equal((await event(x.app, sid, 'MENU_VIEW', { restaurant_id: restaurantB })).status, 400);
});

test('owner reports aggregate overview, item, category, and table performance with rates', async () => {
  const x = setup();
  const sid = await session(x.app);
  for (const [type, extra] of [
    ['MENU_VIEW', {}],
    ['ITEM_IMPRESSION', { menu_item_id: itemA }],
    ['VIDEO_OPEN', { menu_item_id: itemA }],
    ['VIDEO_PLAY', { menu_item_id: itemA }],
    ['VIDEO_PROGRESS', { menu_item_id: itemA, watch_duration_seconds: 10 }],
    ['VIDEO_COMPLETE', { menu_item_id: itemA, watch_duration_seconds: 20 }],
    ['ADD_TO_SELECTION', { menu_item_id: itemA }],
    ['SHOW_WAITER', {}],
  ])
    assert.equal((await event(x.app, sid, type, extra)).status, 202);
  const overview = await request(x.app).get('/api/analytics/overview');
  assert.equal(overview.status, 200);
  assert.equal(overview.body.data.metrics.average_watch_duration, 15);
  assert.equal(overview.body.data.metrics.video_open_rate, 1);
  assert.equal(overview.body.data.metrics.show_waiter_rate, 1);
  const items = await request(x.app).get('/api/analytics/items?sort=selection_rate');
  assert.equal(items.status, 200);
  assert.equal(items.body.data.items[0].adds_to_selection, 1);
  const detail = await request(x.app).get(`/api/analytics/items/${itemA}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.data.metrics.video_completions, 1);
  assert.equal((await request(x.app).get(`/api/analytics/items/${itemB}`)).status, 404);
  assert.equal(
    (await request(x.app).get('/api/analytics/categories')).body.data.categories[0].video_opens,
    1,
  );
  assert.equal(
    (await request(x.app).get('/api/analytics/tables')).body.data.tables[0].show_waiter_events,
    1,
  );
});

test('date ranges default to 30 days and reject invalid, reversed, excessive, and unsupported queries', async () => {
  const app = setup().app;
  const normal = await request(app).get('/api/analytics/overview');
  assert.equal(normal.status, 200);
  const from = new Date(`${normal.body.data.range.from}T00:00:00Z`);
  const to = new Date(`${normal.body.data.range.to}T00:00:00Z`);
  assert.equal((to.getTime() - from.getTime()) / 86400000, 29);
  for (const query of [
    'from=nope',
    'from=2026-02-02&to=2026-02-01',
    'from=2024-01-01&to=2026-01-01',
    'extra=true',
  ])
    assert.equal((await request(app).get(`/api/analytics/overview?${query}`)).status, 400);
});
test('owner report routes require authentication and active owner role', async () => {
  assert.equal(
    (await request(testApp({ authUserId: null }).app).get('/api/analytics/overview')).status,
    401,
  );
  assert.equal(
    (await request(testApp({ authUserId: 'clerk_admin' }).app).get('/api/analytics/overview'))
      .status,
    403,
  );
});
test('public analytics routes apply separate rate limits', async () => {
  const x = setup({ limits: createAnalyticsLimiters({ sessionLimit: 1, eventLimit: 1 }) });
  const sid = await session(x.app);
  assert.equal(
    (await request(x.app).post('/api/public/analytics/session').send({ qr_token: qr })).status,
    429,
  );
  assert.equal((await event(x.app, sid, 'MENU_VIEW')).status, 202);
  const limited = await event(x.app, sid, 'MENU_VIEW');
  assert.equal(limited.status, 429);
  assert.equal(limited.body.error.code, 'RATE_LIMITED');
});

test('analytics event persistence rolls back atomically if session activity update fails', async () => {
  const calls = [];
  const client = {
    query: async (sql) => {
      calls.push(sql);
      if (sql.startsWith('UPDATE analytics_sessions')) throw new Error('update failed');
      return { rows: [] };
    },
    release: () => calls.push('RELEASE'),
  };
  const repository = new AnalyticsRepository({ connect: async () => client });
  await assert.rejects(
    repository.insertEvent(
      { id: randomUUID(), restaurant_id: restaurantA, table_id: tableA },
      { event_type: 'MENU_VIEW' },
      null,
    ),
    /update failed/,
  );
  assert.ok(calls.includes('ROLLBACK'));
  assert.ok(calls.includes('RELEASE'));
});
