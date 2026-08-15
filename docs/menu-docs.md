# Cravio Menu Module

## Purpose

The Menu module lets an active restaurant owner manage categories and menu items. Clerk authenticates the request, the local user identifies the owner, and `restaurants.owner_id` resolves the restaurant used by every menu operation.

## Data model

```text
users.id
  -> restaurants.owner_id
       -> menu_categories.restaurant_id
            -> menu_items.category_id
       -> menu_items.restaurant_id
```

Categories contain a plain-text name and optional description, an active flag, and explicit display order. Items contain a plain-text name and optional description, price, category, active/availability flags, and display order.

`menu_items` stores both `restaurant_id` and `category_id`. A composite foreign key ensures the referenced category belongs to the same restaurant.

## Categories

Categories are owner-defined; no category names are hardcoded. New categories receive the next display order for that restaurant. Names are unique within a restaurant. Inactive categories remain stored but are hidden from public-menu queries.

An empty category can be permanently deleted. A category containing any menu item, including inactive items, returns `409 CATEGORY_HAS_ITEMS` so historical item relationships are not destroyed.

## Menu items

New items receive the next display order within their category. `DELETE /api/menu/items/:id` is a soft deletion that sets `is_active` to `false`.

- `is_active`: whether the item is part of the current menu. Inactive items are hidden publicly.
- `is_available`: temporary availability. Active unavailable items remain visible and are marked unavailable.

## Pricing

Prices use PostgreSQL `NUMERIC(12,2)`, never floating-point storage. The API accepts a non-negative number or decimal string with no more than two fractional digits and normalizes it to two decimal places.

Item currency is not duplicated. Every item inherits `restaurants.currency`, which is the single source of truth.

## Ordering

`display_order` controls category order and item order within a category. Reorder requests must contain the complete set of IDs in the relevant scope, with no missing, unknown, foreign, or duplicate IDs. Database updates run in a transaction and roll back on failure.

## Authorization and IDOR prevention

All `/api/menu` routes require an authenticated, active local user with role `owner`. The API never accepts `restaurant_id` or `owner_id`. Each request resolves:

```text
Clerk session -> local user -> restaurant by owner_id -> scoped menu query
```

Every category and item query includes the resolved restaurant ID. Knowing another restaurant's UUID does not grant read or write access; private lookups return a not-found response.

## API endpoints

Successful JSON responses use `{ "success": true, "data": ... }`. Validation failures use `400`; authentication failures use `401`; authorization and inactive-account failures use `403`; missing scoped resources use `404`; conflicts use `409`.

All endpoints below require an authenticated, active owner.

### Categories

| Method | URL                            | Request                                    | Response           | Common errors                                  |
| ------ | ------------------------------ | ------------------------------------------ | ------------------ | ---------------------------------------------- |
| POST   | `/api/menu/categories`         | `{ "name", "description"?, "is_active"? }` | `201` category     | `RESTAURANT_NOT_FOUND`, `CATEGORY_NAME_EXISTS` |
| GET    | `/api/menu/categories`         | none                                       | ordered categories | `RESTAURANT_NOT_FOUND`                         |
| GET    | `/api/menu/categories/:id`     | none                                       | category           | `CATEGORY_NOT_FOUND`                           |
| PATCH  | `/api/menu/categories/:id`     | any safe category fields                   | updated category   | `CATEGORY_NOT_FOUND`, `CATEGORY_NAME_EXISTS`   |
| DELETE | `/api/menu/categories/:id`     | none                                       | `204`              | `CATEGORY_NOT_FOUND`, `CATEGORY_HAS_ITEMS`     |
| POST   | `/api/menu/categories/reorder` | `{ "category_ids": [uuid, ...] }`          | ordered categories | `INVALID_REORDER`                              |

Protected fields such as `id`, `restaurant_id`, `display_order`, and timestamps are rejected.

### Menu items

| Method | URL                                | Request                                                                             | Response               | Common errors                             |
| ------ | ---------------------------------- | ----------------------------------------------------------------------------------- | ---------------------- | ----------------------------------------- |
| POST   | `/api/menu/items`                  | `{ "category_id", "name", "description"?, "price", "is_available"?, "is_active"? }` | `201` item             | `INVALID_CATEGORY`                        |
| GET    | `/api/menu/items`                  | optional `category_id`, `available=true                                             | false`                 | ordered items                             | `INVALID_CATEGORY` |
| GET    | `/api/menu/items/:id`              | none                                                                                | item                   | `MENU_ITEM_NOT_FOUND`                     |
| PATCH  | `/api/menu/items/:id`              | any safe item fields                                                                | updated item           | `MENU_ITEM_NOT_FOUND`, `INVALID_CATEGORY` |
| DELETE | `/api/menu/items/:id`              | none                                                                                | deactivated item       | `MENU_ITEM_NOT_FOUND`                     |
| PATCH  | `/api/menu/items/:id/availability` | `{ "is_available": false }`                                                         | updated item           | `MENU_ITEM_NOT_FOUND`                     |
| POST   | `/api/menu/items/reorder`          | `{ "category_id", "item_ids": [uuid, ...] }`                                        | ordered category items | `INVALID_CATEGORY`, `INVALID_REORDER`     |

Protected fields such as `id`, `restaurant_id`, `display_order`, and timestamps are rejected.

## Public-menu service

The Public Diner Menu module reuses ordered menu queries and exposes them at `GET /api/public/menu/:qrToken`. It requires an active table and active, published restaurant, returns active categories/items in display order, and keeps unavailable items with `is_available: false`.

## Database

Migration `004_create_menu.sql` adds `menu_categories`, `menu_items`, constraints, and ownership/order indexes. `database/db.sql` contains the complete Auth, Restaurants, and Menu reconstruction schema.

## Testing

```bash
npm test
npm run lint
npm run typecheck
```

Tests use in-memory repositories for route and authorization behavior and an injected transaction client for rollback verification. They do not call Clerk or external services.

## Integrations

Media records reference `menu_items.id`, while upload and processing remain outside Menu. Public Menu returns ready public-safe media fields. Analytics retains menu-item/category references and reports engagement; item deactivation preserves those historical relationships.
