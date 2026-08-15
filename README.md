# Cravio Backend

Modular-monolith Node.js API for Cravio's video-first restaurant menu platform.

## Requirements

- Node.js 24 and npm
- PostgreSQL 16-compatible database
- Clerk application and webhook secret
- S3-compatible object storage/CDN
- FFmpeg/ffprobe for media processing

## Local setup

1. Copy `.env.example` to `.env` and provide local PostgreSQL, Clerk, and S3-compatible storage configuration.
2. Install dependencies with `npm install`.
3. Apply migrations with `npm run db:migrate`, or rebuild an empty database from `database/db.sql`.
4. Start development with `npm run dev`.

Useful commands:

```bash
npm test
npm run lint
npm run typecheck
npm run db:verify
```

Operational probes are `GET /health` for liveness and `GET /health/ready` for dependency readiness. See `docs/core-infrastructure-docs.md` for configuration, security, database, storage, logging, and deployment details.

Production starts with `npm start`. A production `Dockerfile` is included. The API validates critical production configuration before accepting traffic.

## Documentation

Module documentation lives in `docs/`. Start with `backend-status.md`, `backend-production-readiness.md`, and `core-infrastructure-docs.md`; each business module has its own API and behavior document.
