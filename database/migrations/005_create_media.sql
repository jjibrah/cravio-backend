ALTER TABLE menu_items
  ADD CONSTRAINT menu_items_id_restaurant_key UNIQUE (id, restaurant_id);

CREATE TABLE media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  menu_item_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'failed', 'deleted')),
  video_storage_key TEXT NOT NULL UNIQUE CHECK (btrim(video_storage_key) <> ''),
  video_url TEXT,
  thumbnail_storage_key TEXT UNIQUE,
  thumbnail_url TEXT,
  mime_type TEXT NOT NULL CHECK (mime_type IN ('video/mp4', 'video/webm', 'video/quicktime')),
  size_bytes BIGINT CHECK (size_bytes > 0),
  duration_ms INTEGER CHECK (duration_ms > 0 AND duration_ms <= 3600000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT media_assets_item_restaurant_fk
    FOREIGN KEY (menu_item_id, restaurant_id)
    REFERENCES menu_items(id, restaurant_id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT media_assets_ready_fields_check CHECK (status <> 'ready' OR (video_url IS NOT NULL AND size_bytes IS NOT NULL))
);

CREATE INDEX media_assets_item_ready_idx ON media_assets (menu_item_id, updated_at DESC) WHERE status = 'ready';
CREATE INDEX media_assets_restaurant_idx ON media_assets (restaurant_id);
