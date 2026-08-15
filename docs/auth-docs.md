# Cravio Auth & Users

## 1. Purpose

This module connects Clerk-authenticated sessions to Cravio's local users. Clerk owns credentials and sessions; Cravio owns profiles, roles, account status, and business authorization.

## 2. Architecture

```text
React client -> Clerk authentication -> Clerk session token
React client -> Cravio API -> Clerk token verification -> local users table
                                                     -> role/status authorization
```

Clerk metadata is not the source of truth for `role` or `status`. Every protected request loads the local user by `clerk_user_id`.

## 3. Signup Flow

1. The React application starts signup with Clerk's React SDK.
2. Clerk creates the identity and session.
3. Clerk sends a signed `user.created` event to `POST /api/webhooks/clerk`.
4. Cravio verifies the signature and upserts the identity using the Clerk ID.
5. PostgreSQL defaults the local role to `owner` and status to `active`.

Webhook delivery is idempotent because `clerk_user_id` is unique and synchronization uses an upsert. The webhook should be configured before onboarding users; an authenticated Clerk identity without a local record receives `401` safely.

## 4. Login Flow

Clerk performs login. The React client obtains a Clerk session token and sends it as `Authorization: Bearer <token>`. The global Clerk Express middleware verifies the request. `requireAuth` reads the verified Clerk identity, loads the local user, and attaches `{ clerkUserId, user }` to `req.auth`.

There is no backend username/password login endpoint.

## 5. Logout Flow

The frontend calls Clerk's React `signOut()` API or uses Clerk's `<UserButton />`. Clerk terminates the session. Cravio does not issue tokens and therefore has no custom logout or JWT revocation endpoint.

## 6. Password Reset

Use Clerk's sign-in/forgot-password UI or Clerk React APIs to initiate password recovery. Cravio never creates, stores, or emails password-reset tokens.

## 7. Roles

- `owner`: manages their own restaurant and business resources.
- `admin`: manages platform users and platform-level resources.

Authorization uses `requireRole('admin')` or `requireRole('owner', 'admin')` after `requireAuth`. Role values supplied by clients or Clerk public metadata are ignored.

## 8. Account Status

- `active`: may use protected business actions.
- `suspended`: may authenticate and view their identity where allowed, but `requireActiveAccount` blocks business actions.
- `disabled`: retained for history and denied by `requireAuth`, including profile access.

`user.deleted` disables the local record rather than deleting it, preserving restaurant ownership and future audit/history relationships.

## 9. Middleware

```js
router.use(requireAuth, requireRole('owner', 'admin'), requireActiveAccount);
router.get('/admin-only', requireAuth, requireRole('admin'), requireActiveAccount, handler);
```

- `requireAuth`: requires a verified Clerk session and matching, non-disabled local user.
- `requireRole(...roles)`: checks the local database role.
- `requireActiveAccount`: permits only local status `active`.

## 10. API Endpoints

All responses use `{ "success": true, "data": ... }` or `{ "success": false, "error": { "code", "message", "details?" } }`.

### GET `/api/users/me`

- Authentication: required
- Role: any local role
- Body: none
- Response: the local user profile
- Errors: `401` missing/invalid session or missing local profile

### PATCH `/api/users/me`

- Authentication: required; active account required
- Role: any local role
- Body: `{ "first_name": "Dijan", "last_name": "Owner" }` (either field may be supplied)
- Response: updated local profile
- Errors: `400` invalid/unknown fields, `401` unauthenticated, `403` inactive

The strict schema rejects `role`, `status`, `clerk_user_id`, and every other unknown field.

### GET `/api/admin/users`

- Authentication: required; active admin required
- Query: `page` (default `1`), `limit` (default `20`, maximum `100`)
- Response: `{ "items": [], "total": 0, "page": 1, "limit": 20 }`
- Errors: `400`, `401`, `403`

### GET `/api/admin/users/:id`

- Authentication: required; active admin required
- Parameter: local user UUID
- Response: local user profile
- Errors: `400` invalid UUID, `401`, `403`, `404`

### PATCH `/api/admin/users/:id/status`

- Authentication: required; active admin required
- Body: `{ "status": "active" }`, `suspended`, or `disabled`
- Response: updated profile
- Errors: `400` invalid value, `401`, `403`, `404`

### PATCH `/api/admin/users/:id/role`

- Authentication: required; active admin required
- Body: `{ "role": "owner" }` or `{ "role": "admin" }`
- Response: updated profile
- Errors: `400` invalid value, `401`, `403`, `404`

### POST `/api/webhooks/clerk`

- Authentication: Clerk Standard Webhooks signature, not a session token
- Events: `user.created`, `user.updated`, `user.deleted`
- Response: `{ "success": true }`
- Errors: `401` invalid signature, `400` malformed supported identity event

## 11. Clerk Webhooks

Configure a Clerk webhook endpoint ending in `/api/webhooks/clerk` and subscribe to `user.created`, `user.updated`, and `user.deleted`. The official `verifyWebhook` helper verifies `webhook-id`, `webhook-timestamp`, and `webhook-signature` using `CLERK_WEBHOOK_SIGNING_SECRET`.

Created and updated events synchronize the primary email and names. They never update local role or status. Deleted events mark the local record disabled.

## 12. Environment Variables

Copy `.env.example` to `.env` and configure:

```text
DATABASE_URL=
CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLERK_WEBHOOK_SIGNING_SECRET=
```

Never expose `CLERK_SECRET_KEY`, the database URL, or the webhook signing secret to the React client. The React frontend uses only its publishable key.

## 13. Testing

```bash
npm test
npm run lint
npm run typecheck
```

Tests use in-memory repositories and injected Clerk/webhook verifiers. They make no Clerk network calls.

## 14. Security Notes

- Only Clerk's official Express middleware establishes authentication.
- Local PostgreSQL values determine authorization.
- Profile and admin update schemas are strict to prevent mass assignment.
- User identifiers are UUIDs; admin route parameters are validated.
- Webhook signatures are verified before parsing business data.
- Webhook retry delivery is safe due to the unique Clerk ID and upsert.
- Errors expose stable codes and safe messages, not stack traces or database details.
