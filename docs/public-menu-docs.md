# Cravio Public Diner Menu

## Purpose

The Public Diner Menu module serves the read-only menu diners see after scanning a table QR code. Diners do not create accounts and this route does not use Clerk authentication.

```text
QR -> active table -> active, published restaurant
   -> active categories -> active items -> ready public media
```

The module only returns menu data. Temporary selections remain in frontend local storage; it does not create carts, orders, payments, analytics events, or customer accounts.

## Main flow and QR context

1. The frontend extracts the secure token from the scanned QR URL.
2. It requests `GET /api/public/menu/:qrToken`.
3. `TableService.resolveQrToken()` validates the active table and active, published restaurant.
4. The Public Menu service reloads the public context defensively and retrieves the visible menu.
5. The frontend retains the returned stable restaurant, table, and item IDs for future anonymous analytics events.

The response does not repeat the QR token.

## Authentication and rate limiting

No login, Clerk session, role, or account is required. Public QR and menu routes are mounted before Clerk middleware. Requests are limited by IP to 120 requests per minute using `express-rate-limit`; responses include standard rate-limit headers and return `429 RATE_LIMITED` when exceeded.

## Visibility and availability

A menu is visible only when:

- the table is active;
- the restaurant status is `active`;
- the restaurant is published;
- the category is active;
- the item is active.

Inactive categories and items are hidden. Categories with no visible items are hidden. `is_active` controls menu membership; `is_available` is temporary availability. Active unavailable items remain in the default response with `is_available: false`. Passing `available=true` returns only available active items.

Invalid tokens, inactive tables, and unavailable restaurants all return the same `404 PUBLIC_MENU_NOT_FOUND`, avoiding disclosure of private state.

## Pricing and media

Prices are returned unchanged from PostgreSQL `NUMERIC(12,2)` values, with currency provided once at restaurant level. No money calculations occur here.

For each item, the query selects the newest `ready` Media asset and returns only `video_url` and `thumbnail_url`. Storage keys, bucket names, MIME metadata, and provider details are never exposed. Items without ready media return `media: null` and remain usable.

## Public response

```json
{
  "success": true,
  "data": {
    "restaurant": {
      "id": "uuid",
      "name": "The Urban Fork",
      "slug": "the-urban-fork",
      "description": "Modern casual dining",
      "logo_url": "https://cdn.example/logo.webp",
      "cover_image_url": "https://cdn.example/cover.webp",
      "currency": "MYR"
    },
    "table": {
      "id": "uuid",
      "name": "Table 4",
      "code": "T04"
    },
    "categories": [
      {
        "id": "uuid",
        "name": "Mains",
        "description": "Main dishes",
        "display_order": 1,
        "items": [
          {
            "id": "uuid",
            "name": "Truffle Pasta",
            "description": "...",
            "price": "32.00",
            "is_available": true,
            "display_order": 1,
            "media": {
              "thumbnail_url": "https://cdn.example/pasta.webp",
              "video_url": "https://cdn.example/pasta.mp4"
            }
          }
        ]
      }
    ]
  }
}
```

Every field is explicitly mapped. Owner IDs, Clerk IDs, status fields, publication fields, timestamps, QR tokens, and storage metadata are excluded.

## Endpoint

### `GET /api/public/menu/:qrToken`

- Authentication: none
- Path: `qrToken` must be a UUID
- Query: optional `available=true`; all other values and unknown filters are rejected
- Success: compact public restaurant, table, categories, items, availability, pricing, and media
- Errors: `400 INVALID_REQUEST`, `404 PUBLIC_MENU_NOT_FOUND`, `429 RATE_LIMITED`, or safe `500 INTERNAL_ERROR`

No slug route is included in V1 because table QR access is the primary flow.

## Query efficiency and caching

The request uses three bounded database operations: existing QR resolution, one defensive public context query, and one menu query. The menu query joins active categories/items and uses a lateral lookup for the newest ready media, avoiding category/item/media N+1 queries.

No Redis dependency is introduced. The service is read-only and response-shaped, so a short-lived cache can later use the resolved restaurant ID when coordinated invalidation exists for restaurant, menu, availability, and media changes.

## Database

No schema change is required. The module reuses `restaurants`, `restaurant_tables`, `menu_categories`, `menu_items`, and `media_assets`. Consequently, no migration or `database/db.sql` change is needed.

## Testing

```bash
npm test
npm run lint
npm run typecheck
```

Tests cover unauthenticated access, public shaping, visibility, ordering, availability filtering, missing media, QR failures, safe errors, field leakage, and bounded repository calls. Tables, Menu, Media, Auth, and Users suites run as regressions.

## Future dependencies

The future Analytics module can use returned restaurant, table, and menu-item IDs with anonymous session IDs. The Media module remains responsible for upload, validation, replacement, and deletion; this module only reads ready public URLs.
