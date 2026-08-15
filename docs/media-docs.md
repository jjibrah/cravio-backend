# Cravio Media module

## Purpose and architecture

The Media module owns short food-video validation, thumbnail generation, object-storage metadata, replacement, and deletion. PostgreSQL never stores video/image bytes, and Express never proxies diner playback.

```text
Menu item → media record → media service → S3-compatible storage → CDN/diner
```

The implementation uses direct, signed `PUT` uploads so large request bodies bypass the application. On completion, the backend downloads the candidate into a random OS temporary directory only for FFprobe inspection and FFmpeg thumbnail extraction. Temporary files are always removed. Ready public URLs point directly to storage/CDN.

## Upload and validation flow

1. An authenticated active owner requests an upload intent for an owned menu item.
2. Cravio generates a non-predictable key under `restaurants/{restaurant}/menu-items/{item}/videos/{uuid}.{ext}`.
3. The client uploads directly to the signed S3-compatible URL.
4. The client calls completion with an empty JSON body.
5. Cravio verifies storage MIME/size, downloads the candidate temporarily, and uses FFprobe to validate its container, video stream, duration, width, and height.
6. FFmpeg extracts an optimized JPEG frame near 1.5 seconds (or halfway through very short videos) and uploads it.
7. A database transaction activates the candidate and retires the prior ready record.
8. Obsolete storage objects are deleted best-effort after the successful switch.

Validation does not trust the filename, request MIME, or client-provided duration alone. V1 accepts MP4 and WebM, defaults to 100 MiB maximum, and defaults to 45 seconds maximum. Empty, corrupt, malformed, mismatched, oversized, and over-duration videos are rejected. Original filenames are optional metadata, limited to 255 characters, and may not contain path separators; they are never used as keys.

## Atomic replacement and deletion

Creating another upload intent for the same item is the replacement flow. The old video remains ready while the candidate is uploaded, probed, and thumbnailed. The database switches the ready association transactionally only after all candidate processing succeeds. A partial unique index enforces one ready video per menu item. Candidate failure marks it failed, deletes its candidate objects, and leaves the old video unchanged.

Deletion first marks metadata `deleted` and clears public URLs, then attempts to remove video and thumbnail objects. Cleanup failure is logged without restoring public visibility. Records are preserved for future historical references. Deactivating a menu item does not automatically delete media.

## Storage abstraction

`media.storage.js` encapsulates S3-compatible operations: signed upload creation, object inspection, temporary download, server-generated thumbnail upload, deletion, and public URL generation. It supports AWS S3, Cloudflare R2, MinIO, or one configured compatible provider; provider SDK objects do not escape into controllers/services.

Production startup fails clearly when bucket, credentials, or public URL are incomplete. Development can start without storage, but media operations return `MEDIA_STORAGE_UNAVAILABLE`.

## API

All endpoints require Clerk authentication followed by an active local owner account. Restaurant and item ownership are derived server-side.

| Method   | Endpoint                                     | Body                                                       | Result                                                   |
| -------- | -------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------- |
| `POST`   | `/api/media/menu-items/:itemId/video-upload` | `{"mime_type":"video/mp4","original_filename":"dish.mp4"}` | Processing record and signed upload URL                  |
| `POST`   | `/api/media/:id/complete`                    | `{}`                                                       | Probe, generate thumbnail, and atomically activate video |
| `GET`    | `/api/media/menu-items/:itemId`              | none                                                       | Current ready owner metadata                             |
| `POST`   | `/api/media/:id/thumbnail-upload`            | `{"mime_type":"image/webp"}`                               | Optional replacement-thumbnail upload URL                |
| `POST`   | `/api/media/:id/thumbnail-complete`          | `{}`                                                       | Validate optional replacement thumbnail                  |
| `DELETE` | `/api/media/:id`                             | none                                                       | Soft-delete metadata and remove objects                  |

Upload initialization and completion share a conservative default limit of 20 requests per request context per hour. Common errors include `VIDEO_TOO_LARGE`, `VIDEO_TOO_LONG`, `UNSUPPORTED_VIDEO_FORMAT`, `INVALID_VIDEO`, `THUMBNAIL_GENERATION_FAILED`, `MEDIA_PROCESSING_FAILED`, `MEDIA_NOT_FOUND`, `MENU_ITEM_NOT_FOUND`, and `MEDIA_STORAGE_UNAVAILABLE`.

## Public delivery

The Public Diner Menu joins only the current `ready` media record and exposes only:

```text
video_url
thumbnail_url
duration_seconds
```

It never returns storage keys, original filenames, bucket/provider metadata, credentials, failed/deleted state, or internal paths. Analytics video events remain the Analytics module's responsibility.

## Configuration

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
MEDIA_MAX_VIDEO_DURATION_SECONDS=45
FFMPEG_PATH=ffmpeg
FFPROBE_PATH=ffprobe
```

Set an endpoint for R2/MinIO; it may remain empty for AWS. Configure storage CORS for browser `PUT`, configure CDN read access, and install compatible `ffmpeg`/`ffprobe` binaries in the deployment image. Because video bytes do not enter Express, its JSON/body limit does not need to equal the video limit.

## Database

`media_assets` references both restaurant and menu item through an integrity-enforced composite relationship. It stores type/status, opaque keys, public URLs, optional original filename, MIME, size, duration, dimensions, and timestamps. Migration `009_complete_media_processing.sql` upgrades the earlier media table. `database/db.sql` is the full reconstruction snapshot.

## Testing

```bash
npm test -- tests/media/media.test.js
npm test -- tests/public-menu/public-menu.test.js
npm test
npm run lint
npm run typecheck
```

Tests inject fake storage and processors; they make no cloud calls and require no local FFmpeg binary. The current database is reference-only, so migrations are statically checked rather than applied to a live database.
