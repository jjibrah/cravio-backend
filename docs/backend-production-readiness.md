# Backend production readiness

## Code and verification

- [x] Auth, Restaurants, Menu, Media, Tables/QR, Public Menu, Analytics, Admin, and Core routes are mounted.
- [x] Automated tests, lint, type checking, and formatting are repository commands.
- [x] Canonical schema and incremental migrations are present.
- [x] Dockerfile and GitHub Actions verification workflow are present.
- [ ] Execute `npm run db:verify` against an available disposable PostgreSQL instance.
- [ ] Build and run the Docker image in an environment with Docker available.

## External launch blockers

- [ ] Provision PostgreSQL, set `DATABASE_URL`, apply migrations, enable automated backups, and test a restore.
- [ ] Create the production Clerk application, set backend keys, configure frontend redirects/origins, and register the signed webhook URL.
- [ ] Provision an S3-compatible production bucket/CDN, least-privilege credentials, object CORS, and lifecycle cleanup for abandoned multipart/direct uploads.
- [ ] Configure every production variable from `.env.example` in the deployment secret store.
- [ ] Configure the real frontend/public origins, API domain, HTTPS, and the trusted-proxy hop count.
- [ ] Set the proxy/load-balancer request-body limit consistently with the direct-upload design.
- [ ] Configure `/health` for liveness and `/health/ready` for traffic readiness.
- [ ] Configure log collection/alerting and monitor dependency/readiness failures.
- [ ] Run staging smoke tests covering Clerk sync, storage upload/delete/playback, QR-to-menu, analytics, and admin status changes.
- [ ] Run post-deployment smoke tests and verify database and storage backups.

The API does not proxy diner video traffic. Storage/CDN availability, permissions, and delivery headers must therefore be verified outside the repository before launch.
