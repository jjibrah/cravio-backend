# Cravio Media Module

## Purpose and architecture

The Media module manages video and thumbnail metadata for menu items. Binary files are uploaded directly from the owner client to S3-compatible object storage and served to diners through the configured public CDN/storage URL.

```text
Authenticated owner -> Cravio upload intent -> signed storage URL
Owner client -> S3-compatible storage -> video object
Owner client -> Cravio completion -> verified media metadata
Diner -> CDN/storage -> video
```

Express does not receive or stream video bodies.

## Data model

`media_assets` belongs to both a restaurant and a menu item. Its composite foreign key `(menu_item_id, restaurant_id)` prevents media from being associated with an item belonging to another restaurant.

Stored metadata includes provider object keys, public video/thumbnail URLs, MIME type, byte size, duration, lifecycle status, and timestamps. Status values are `pending`, `ready`, `failed`, and `deleted`.

Multiple historical metadata records may exist for an item. Completing a replacement retires the previous ready asset and requests deletion of its storage objects. Deleted assets retain their database record but no longer expose URLs.

## Authorization

Every route requires an authenticated, active local owner. The service derives the restaurant from the local user and scopes every menu-item and media lookup to that restaurant. Client-provided restaurant or owner IDs are never accepted. Suspended/disabled users and inactive restaurants cannot manage media.

## Upload and completion

1. Request a short-lived upload URL with the intended MIME type.
2. Upload the object directly with HTTP `PUT` and the returned `content-type` header.
3. Call the completion endpoint.
4. Cravio performs a storage `HEAD` request and validates the actual content type and size before marking media ready.

Supported video types: MP4, WebM, and QuickTime. Supported thumbnail types: JPEG, PNG, and WebP. Defaults are 100 MiB per video, 5 MiB per thumbnail, and a 15-minute upload URL lifetime; all are configurable.

## API endpoints

All routes require an active owner and use `{ "success": true, "data": ... }` responses.

| Method | URL | Request | Purpose |
|---|---|---|---|
| POST | `/api/media/menu-items/:itemId/video-upload` | `{ "mime_type": "video/mp4" }` | Create pending metadata and direct-upload URL |
| POST | `/api/media/:id/complete` | `{ "duration_ms": 25000 }` | Verify storage object and mark video ready |
| GET | `/api/media/menu-items/:itemId` | none | Get the newest ready asset for an owned item |
| POST | `/api/media/:id/thumbnail-upload` | `{ "mime_type": "image/webp" }` | Create thumbnail upload URL |
| POST | `/api/media/:id/thumbnail-complete` | `{}` | Verify and attach the thumbnail URL |
| DELETE | `/api/media/:id` | none | Delete storage objects and mark metadata deleted |

Common errors include `UNAUTHENTICATED`, `FORBIDDEN`, `RESTAURANT_NOT_FOUND`, `RESTAURANT_INACTIVE`, `MENU_ITEM_NOT_FOUND`, `MEDIA_NOT_FOUND`, `INVALID_MEDIA_TYPE`, `INVALID_MEDIA_SIZE`, `INVALID_THUMBNAIL`, `MEDIA_STATE_CONFLICT`, and `MEDIA_STORAGE_UNAVAILABLE`.

## Storage configuration

The adapter supports AWS S3, Cloudflare R2, MinIO, and compatible services:

```text
MEDIA_STORAGE_BUCKET=
MEDIA_STORAGE_REGION=auto
MEDIA_STORAGE_ENDPOINT=
MEDIA_STORAGE_ACCESS_KEY_ID=
MEDIA_STORAGE_SECRET_ACCESS_KEY=
MEDIA_PUBLIC_BASE_URL=https://cdn.example.com
MEDIA_UPLOAD_EXPIRES_SECONDS=900
MEDIA_MAX_VIDEO_BYTES=104857600
MEDIA_MAX_THUMBNAIL_BYTES=5242880
```

For AWS S3, `MEDIA_STORAGE_ENDPOINT` may be empty. For R2/MinIO, set the provider endpoint. Storage credentials remain server-only. The bucket must allow browser `PUT` requests from the frontend origin through its CORS policy. CDN or bucket access policy must allow reads for ready public media URLs.

## Database and migration

`database/migrations/005_create_media.sql` adds `media_assets` and the composite menu-item ownership constraint. `database/db.sql` contains the full reconstruction schema. No raw media data is stored in PostgreSQL.

## Testing

```bash
npm test
npm run lint
npm run typecheck
```

Tests inject an in-memory storage adapter, make no external storage calls, and cover authentication, status checks, media validation, completion, thumbnails, deletion, and cross-restaurant IDOR protection.

## Future integration

The Public Diner Menu module should expose only the newest `ready` media asset for active items in published, active restaurants. Analytics may reference `media_assets.id` when recording video engagement. Transcoding and automatic thumbnail generation can later be added behind the storage/media service without changing menu ownership rules.
