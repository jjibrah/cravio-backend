# Backend status

## Completion matrix

| Module              | Code state | External verification                                     |
| ------------------- | ---------- | --------------------------------------------------------- |
| Auth & Users        | DONE       | Production Clerk keys/webhook required                    |
| Restaurants         | DONE       | Live PostgreSQL integration required                      |
| Menu                | DONE       | Live PostgreSQL integration required                      |
| Media               | DONE       | Real S3-compatible storage and FFmpeg smoke test required |
| Tables & QR         | DONE       | Deployed public URL/printed scan test required            |
| Public Diner Menu   | DONE       | Staging end-to-end test required                          |
| Analytics           | DONE       | Load/retention policy should be measured in staging       |
| Admin               | DONE       | Production admin bootstrap/process required               |
| Core Infrastructure | DONE       | Docker and database reconstruction need external tooling  |

## Fixed during the final audit

- Added dedicated Restaurants integration coverage and documentation.
- Required active categories and available active items before restaurant publication.
- Made analytics event creation and session activity updates one database transaction.
- Added validated date ranges to Admin engagement metrics.
- Removed a dead duplicate restaurant repository and an unused direct Clerk dependency.
- Passed the centralized logger into Media processing.
- Added container and continuous-integration definitions.

## Route security summary

Public routes are limited to health, Clerk webhook verification, public restaurant/QR/menu reads, and anonymous analytics ingestion. Owner routes derive the local user and restaurant on the server. Admin routes require an active local `admin` role. Public responses whitelist fields and hide inactive/unpublished resources behind generic not-found errors.

## Pending before deployment

No known V1 business route is missing. Deployment remains blocked until a real PostgreSQL database, Clerk production application, S3-compatible storage/CDN, domain/HTTPS configuration, production secrets, backups, monitoring, and staging smoke tests exist. Docker was not available on the audit workstation, so the image definition is committed but not locally built.

## Future V2 scope

Actual ordering/payments, waiter or customer accounts, POS integration, reservations, reviews, subscriptions, multi-branch management, recommendations, and advanced BI remain intentionally out of scope.
