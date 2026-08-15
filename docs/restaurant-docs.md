# Restaurants

The Restaurants module owns restaurant profiles, branding URLs, currency, lifecycle status, publication state, and the local-user ownership relationship. Clerk identifies the caller; `restaurants.owner_id` references `users.id`. A database unique constraint and service check enforce one restaurant per owner for V1.

## Owner API

All owner routes require Clerk authentication, an active local owner account, and server-derived ownership.

| Method | Route                           | Purpose                                            |
| ------ | ------------------------------- | -------------------------------------------------- |
| POST   | `/api/restaurants`              | Create the caller's restaurant; starts unpublished |
| GET    | `/api/restaurants/me`           | Read the caller's restaurant                       |
| PATCH  | `/api/restaurants/me`           | Update whitelisted profile/branding fields         |
| POST   | `/api/restaurants/me/publish`   | Publish after readiness validation                 |
| POST   | `/api/restaurants/me/unpublish` | Hide the restaurant without deleting data          |

Clients cannot set `owner_id`, status, publication fields, IDs, or timestamps. Updates accept profile fields only. Logo and cover image values are URLs; binary media upload belongs to Media.

Publication requires an active restaurant, a complete profile, at least one active category, and at least one active and available item in an active category. The first successful publication sets `published_at`; later publication does not erase the historical first-publication timestamp.

`user.status`, `restaurant.status`, and `restaurant.is_published` are independent. Suspended or disabled restaurants cannot be changed by owners or viewed publicly. Admin status changes use `/api/admin/restaurants/:id/status` and preserve all restaurant data.

`GET /api/public/restaurants/:slug` is unauthenticated and returns an explicit public-field whitelist only when the restaurant is active and published. The QR-based Public Menu endpoint is the primary diner flow.

The schema is defined incrementally in `database/migrations/002_create_restaurants.sql` and completely in `database/db.sql`. Run restaurant coverage with `node --test tests/restaurants/restaurants.test.js` or the full suite with `npm test`.
