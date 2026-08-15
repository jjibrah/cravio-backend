# Analytics module

## Purpose and limitation

Cravio Analytics records anonymous diner engagement as immutable events and calculates reports from those events. It measures menu browsing, video engagement, selection intent, and table-level activity. `SHOW_WAITER` means that the diner opened their selection for a waiter; it is purchase intent, **not a confirmed order or sale**.

No diner account is created. The analytics tables do not intentionally store names, email addresses, phone numbers, Clerk IDs, or full IP addresses. IP information may be used transiently by the HTTP rate limiter but is not persisted as analytics data.

## Anonymous sessions

The frontend starts a session by sending the table QR token. The backend reuses the Tables & QR resolver, which requires an active table and an active, published restaurant. It generates a cryptographically random UUID and derives `restaurant_id` and `table_id` from the resolved QR context.

```text
QR token → active table → active published restaurant → anonymous session
```

Session IDs are globally unique and are the only context accepted by event ingestion. Client-provided restaurant or table IDs are rejected as unknown fields.

## Events

| Event | Frontend meaning | Item required | Duration |
|---|---|---:|---:|
| `MENU_VIEW` | Public menu is opened | No | No |
| `ITEM_IMPRESSION` | Item becomes visible in the viewport | Yes | No |
| `VIDEO_OPEN` | Video/player detail is opened | Yes | No |
| `VIDEO_PLAY` | Playback actually begins | Yes | No |
| `VIDEO_PROGRESS` | Meaningful playback progress | Yes | Required |
| `VIDEO_COMPLETE` | Video reaches the chosen completion threshold | Yes | Required |
| `ADD_TO_SELECTION` | Item is added to the local-device selection | Yes | No |
| `REMOVE_FROM_SELECTION` | Item is removed from the selection | Yes | No |
| `SHOW_WAITER` | Final selection screen is shown | No | No |

The frontend should emit progress at meaningful intervals (for example every five seconds or at 25/50/75 percent), not every second. Watch duration accepts 0–120 seconds. Repeated events are retained because repeated views and plays are legitimate.

Optional metadata is strictly limited to `selected_item_count`, `video_progress_percent`, and `frontend_version`, with a 1 KB maximum. Selection count is only accepted for `SHOW_WAITER`; progress percent is only accepted for progress/completion events. Metadata must never contain personal data.

## Public endpoints

Public endpoints require no Clerk session.

### `POST /api/public/analytics/session`

Request:

```json
{ "qr_token": "uuid" }
```

Returns HTTP 201 with `{ "success": true, "data": { "session_id": "uuid" } }`. Invalid, inactive, unpublished, suspended, and disabled QR contexts return a generic 404 without revealing private state. Limited to 30 requests per minute per request context/IP.

### `POST /api/public/analytics/events`

Request example:

```json
{
  "session_id": "uuid",
  "event_type": "VIDEO_PROGRESS",
  "menu_item_id": "uuid",
  "watch_duration_seconds": 15,
  "metadata": { "video_progress_percent": 50 }
}
```

Returns HTTP 202 with `{ "success": true }`. The backend verifies the active session and that any submitted menu item belongs to the session's restaurant. It derives category, restaurant, and table context from trusted database relationships. Limited to 300 requests per minute.

## Owner reports

All report endpoints require `requireAuth`, an active local account, and local role `owner`. The restaurant is derived from the authenticated local user; no restaurant ID is accepted from the client.

| Method and path | Result |
|---|---|
| `GET /api/analytics/overview` | Headline counts, average watch duration, unique sessions, and rates |
| `GET /api/analytics/items` | Per-item performance; optional `sort=video_opens\|selection_rate\|impressions\|adds_to_selection` |
| `GET /api/analytics/items/:id` | Detailed owned-item performance |
| `GET /api/analytics/categories` | Category impressions, video opens, selections, and unique sessions |
| `GET /api/analytics/tables` | Sessions and engagement grouped by table |

All accept `from=YYYY-MM-DD&to=YYYY-MM-DD`. The inclusive default is the latest 30 calendar days; the maximum span is 365 days. Invalid or reversed ranges return HTTP 400. A foreign restaurant's item is deliberately returned as not found.

Overview formulas are:

```text
videoOpenRate = VIDEO_OPEN / ITEM_IMPRESSION
selectionRate = ADD_TO_SELECTION / VIDEO_OPEN
showWaiterRate = SHOW_WAITER / MENU_VIEW
```

Division by zero returns `0`. Counts represent raw events; `unique_sessions` uses distinct anonymous session IDs.

## Database and performance

Migration `008_create_analytics.sql` creates `analytics_sessions` and `analytics_events`. `database/db.sql` contains the same definitions as part of the full Cravio reconstruction snapshot. Composite foreign keys enforce session restaurant/table context and menu-item category/restaurant context. Event type, duration, and JSON-object checks are also enforced by PostgreSQL.

Reports use SQL `COUNT`, `AVG`, filtered aggregates, grouping, and distinct session counts rather than loading event history into application memory. Indexes cover restaurant/date, restaurant/event/date, session, menu item, category, and table reporting paths. The design is cache-friendly, but V1 does not introduce Redis or streaming infrastructure.

## Frontend integration

```text
menu loads → create/reuse analytics session
item enters viewport → ITEM_IMPRESSION
video opened → VIDEO_OPEN
play begins → VIDEO_PLAY
watch progresses → VIDEO_PROGRESS
video completes → VIDEO_COMPLETE
item selected/removed → ADD_TO_SELECTION / REMOVE_FROM_SELECTION
show waiter clicked → SHOW_WAITER
```

The selection itself remains in frontend local storage. Analytics never creates a cart or order.

## Testing

```bash
npm test -- tests/analytics/analytics.test.js
npm test
npm run lint
npm run typecheck
```

Tests use in-memory repositories and make no Clerk or database network calls. Because the project database snapshot is currently reference-only, schema verification is static until deployment connectivity is configured.
