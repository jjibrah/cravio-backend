# Cravio Admin Module

## Purpose

The Admin module provides the small operational surface needed by Cravio platform administrators in V1: owner inspection/status management, restaurant inspection/status management, basic platform counts, and audited sensitive changes. It does not provide billing, support tickets, impersonation, moderation workflows, orders, or advanced BI.

## Authorization

```text
Clerk session -> local users record -> role=admin -> status=active
```

Every `/api/admin/*` route applies `requireAuth`, `requireActiveAccount`, and `requireRole('admin')`. The local database role/status is authoritative; Clerk metadata is not used for business authorization. Owners receive `403`, and suspended/disabled admins cannot perform admin actions.

## Independent statuses

`user.status`, `restaurant.status`, and `restaurant.is_published` are independent:

- An active owner with a suspended restaurant may authenticate, but restaurant operations and public visibility remain blocked.
- A suspended owner with an active restaurant cannot perform protected owner operations.
- Restaurant status changes never silently change owner status or publication state.

Allowed owner and restaurant statuses are `active`, `suspended`, and `disabled`. Changes preserve all records; nothing is hard-deleted and Clerk accounts are not modified.

## Restaurant management

Restaurant lists use database pagination and support `status`, `published`, and basic `search` filters across restaurant name/slug and owner identity. Details include the profile, owner summary, publication state, category/item counts, and table count. Status changes are transactional and audited.

## Owner management

Owner lists use database pagination and support `status` and `search` across name, email, and restaurant name. Responses whitelist local operational identity and restaurant summary fields; Clerk IDs, sessions, and secrets are excluded. Owner status changes immediately affect protected Cravio operations and are audited.

## Self-lockout and role protection

The backward-compatible `/api/admin/users` routes retain existing user/role management. They now reject admin self-suspension, self-disable, and self-demotion. They also prevent deactivation or demotion when the target is the last active administrator.

## Platform dashboard

`GET /api/admin/dashboard` returns:

- total and active owners;
- total, active, and published restaurants;
- total menu items;
- total restaurant tables.

The Analytics module does not exist yet, so engagement metrics and date-range filtering are intentionally omitted rather than mocked.

## Audit logging

`admin_audit_logs` records sensitive mutations atomically with their target update:

```text
admin_user_id
action
target_type
target_id
old_values JSONB
new_values JSONB
created_at
```

Recorded actions are `OWNER_STATUS_CHANGED`, `RESTAURANT_STATUS_CHANGED`, `OWNER_ROLE_CHANGED`, and `USER_STATUS_CHANGED`. Reads do not generate audit noise. Passwords, Clerk secrets, tokens, sessions, and environment configuration are never logged.

## Endpoints

All endpoints require an authenticated, active admin.

| Method | URL | Query/body | Result | Common errors |
|---|---|---|---|---|
| GET | `/api/admin/dashboard` | no query parameters | platform counts | `401`, `403` |
| GET | `/api/admin/restaurants` | `page`, `limit`, `status`, `published`, `search` | restaurants plus pagination | validation errors |
| GET | `/api/admin/restaurants/:id` | UUID path | profile, owner and content counts | `RESTAURANT_NOT_FOUND` |
| PATCH | `/api/admin/restaurants/:id/status` | `{ "status": "suspended" }` | updated restaurant | validation, not found |
| GET | `/api/admin/owners` | `page`, `limit`, `status`, `search` | owners plus pagination | validation errors |
| GET | `/api/admin/owners/:id` | UUID path | owner and restaurant summary | `OWNER_NOT_FOUND` |
| PATCH | `/api/admin/owners/:id/status` | `{ "status": "disabled" }` | updated owner | validation, not found |
| GET | `/api/admin/users` | `page`, `limit` | backward-compatible user list | validation errors |
| GET | `/api/admin/users/:id` | UUID path | local user | `USER_NOT_FOUND` |
| PATCH | `/api/admin/users/:id/status` | allowed status | updated user | self/last-admin protection |
| PATCH | `/api/admin/users/:id/role` | `{ "role": "owner\|admin" }` | updated user | self/last-admin protection |

List responses use:

```json
{
  "success": true,
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "pages": 5
  }
}
```

Page defaults to 1, limit defaults to 20, and the maximum limit is 100. Unknown parameters, malformed UUIDs, invalid status values, and invalid booleans are rejected.

## Database

Migration `007_create_admin_audit_logs.sql` adds the audit table and indexes for administrator, target, creation time, and published-restaurant filtering. `database/db.sql` remains the complete reconstruction snapshot for all current Cravio modules.

## Testing

```bash
npm test
npm run lint
npm run typecheck
```

Tests cover authorization, pagination/search/filtering, details, metrics, status effects, audit records, read audit silence, self-lockout, last-admin protection, protected-owner behavior, and all existing module regressions.
