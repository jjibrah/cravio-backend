ALTER TABLE media_assets
  ADD COLUMN media_type TEXT NOT NULL DEFAULT 'video' CHECK (media_type = 'video'),
  ADD COLUMN original_filename VARCHAR(255),
  ADD COLUMN duration_seconds NUMERIC(8,3),
  ADD COLUMN width INTEGER,
  ADD COLUMN height INTEGER;

UPDATE media_assets SET duration_seconds = duration_ms / 1000.0 WHERE duration_ms IS NOT NULL;
ALTER TABLE media_assets DROP CONSTRAINT media_assets_status_check;
UPDATE media_assets SET status = 'processing' WHERE status = 'pending';

ALTER TABLE media_assets
  DROP CONSTRAINT media_assets_mime_type_check,
  DROP CONSTRAINT media_assets_ready_fields_check,
  ADD CONSTRAINT media_assets_duration_check CHECK (duration_seconds > 0 AND duration_seconds <= 120),
  ADD CONSTRAINT media_assets_status_check CHECK (status IN ('processing', 'ready', 'failed', 'deleted')),
  ADD CONSTRAINT media_assets_dimensions_check CHECK ((width IS NULL AND height IS NULL) OR (width > 0 AND height > 0)),
  ADD CONSTRAINT media_assets_mime_type_check CHECK (mime_type IN ('video/mp4', 'video/webm')),
  ADD CONSTRAINT media_assets_ready_fields_check CHECK (status <> 'ready' OR (video_url IS NOT NULL AND thumbnail_url IS NOT NULL AND size_bytes IS NOT NULL AND duration_seconds IS NOT NULL)),
  DROP COLUMN duration_ms;

DROP INDEX media_assets_item_ready_idx;
CREATE UNIQUE INDEX media_assets_one_ready_per_item_idx ON media_assets (menu_item_id) WHERE status = 'ready';
CREATE INDEX media_assets_status_idx ON media_assets (status);
