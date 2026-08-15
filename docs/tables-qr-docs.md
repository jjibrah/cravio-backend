# Cravio Tables & QR

## Purpose

The Tables & QR module lets restaurant owners create and manage restaurant tables. Every table receives a stable, globally unique public QR token. Public QR resolution provides the restaurant/table context needed by the future diner menu.

## Data model

```text
users.id -> restaurants.owner_id -> restaurant_tables.restaurant_id
                                      -> secure qr_token
```

`restaurant_tables` stores a UUID primary key, restaurant relationship, owner-facing name and code, public QR token, active state, and timestamps. Names and codes are unique within a restaurant. QR tokens are globally unique UUIDs.

## Management and authorization

All `/api/tables` routes require an authenticated, active local owner. The service resolves the restaurant through the authenticated local user and scopes every table lookup by both table ID and restaurant ID. It never accepts `restaurant_id`, `owner_id`, or `qr_token` from table-management request bodies.

Owners may rename tables, change codes, and activate/deactivate them. Renaming does not change the QR token. `DELETE` performs soft deactivation and retains the record and token for history; an old token is never assigned to a different table.

## Bulk creation

`POST /api/tables/bulk` creates 1–50 tables in one database transaction. For `{ "count": 5, "prefix": "Table", "code_prefix": "T" }`, it creates `Table 1` through `Table 5` with codes `T01` through `T05`. Every row receives an independently generated cryptographic UUID token. Any conflict rolls back the entire batch.

## QR design and generation

QR images encode only:

```text
PUBLIC_APP_URL/q/{qrToken}
```

They do not contain database table IDs, owner IDs, credentials, or private restaurant data. The `qrcode` package generates downloadable PNG and SVG assets. Print endpoints return simple print-friendly HTML with inline SVG, restaurant name, table name/code, and “Scan to view menu.” PDF generation is intentionally deferred.

## Regeneration

`POST /api/tables/:id/qr/regenerate` creates and persists a new random token. The old token immediately stops resolving. Normal edits never regenerate tokens.

## Public resolution

```text
QR scan -> token -> active table -> active, published restaurant -> public context
```

`GET /api/public/qr/:token` requires no authentication. It returns only restaurant `id`, `name`, and `slug`, plus table `id` and `name`. Invalid tokens, inactive tables, unpublished restaurants, and suspended/disabled restaurants all return the same safe `404 QR_NOT_FOUND` response.

The reusable `TableService.resolveQrToken(token)` method is intended for the future Public Diner Menu module.

## API endpoints

Owner endpoints use `{ "success": true, "data": ... }` and require an active owner.

| Method | URL | Request | Result | Common errors |
|---|---|---|---|---|
| POST | `/api/tables` | `{ "name": "Table 1", "code": "T01" }` | `201` table and QR URL | `TABLE_ALREADY_EXISTS`, `RESTAURANT_NOT_FOUND` |
| POST | `/api/tables/bulk` | `{ "count": 20, "prefix": "Table", "code_prefix": "T" }` | `201` created tables | validation, `TABLE_ALREADY_EXISTS` |
| GET | `/api/tables` | none | owner’s tables | authentication/status errors |
| GET | `/api/tables/:id` | none | owned table | `TABLE_NOT_FOUND` |
| PATCH | `/api/tables/:id` | safe subset of `name`, `code`, `is_active` | updated table | validation, `TABLE_NOT_FOUND`, conflict |
| DELETE | `/api/tables/:id` | none | deactivated table | `TABLE_NOT_FOUND` |
| GET | `/api/tables/:id/qr?format=png\|svg` | none | downloadable QR image | `TABLE_NOT_FOUND`, invalid format |
| GET | `/api/tables/:id/qr/print` | none | single-table print HTML | `TABLE_NOT_FOUND` |
| GET | `/api/tables/qr/print` | none | active-table print HTML | authentication/status errors |
| POST | `/api/tables/:id/qr/regenerate` | none | table and new QR URL | `TABLE_NOT_FOUND`, `QR_TOKEN_CONFLICT` |
| GET | `/api/public/qr/:token` | none; public | safe restaurant/table context | `QR_NOT_FOUND` |

Unknown fields, malformed UUIDs, invalid code characters, unsupported formats, and invalid bulk counts return `400` through the centralized validation handler.

## Database

Migration `006_create_restaurant_tables.sql` creates the table, foreign key, uniqueness constraints, and active-table lookup index. `database/db.sql` remains the complete reconstruction schema for Users, Restaurants, Menu, Media, and Tables.

## Testing

```bash
npm test
npm run lint
npm run typecheck
```

Tests cover authentication, account status, ownership/IDOR, uniqueness, transactional bulk rollback, soft deactivation, PNG/SVG generation, printing, public resolution rules, and immediate invalidation after regeneration.

## Future integration

The Public Diner Menu module should call `resolveQrToken` and then load the published restaurant menu. Future anonymous analytics events can safely store the returned `restaurant.id` and `table.id`. This module does not implement public menus, analytics, occupancy, ordering, reservations, or floor plans.
