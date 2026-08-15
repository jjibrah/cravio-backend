-- =========================================
-- CRAVIO DATABASE - canonical reconstruction
-- =========================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Local application users. Clerk remains the authentication provider.
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id TEXT NOT NULL UNIQUE,
  email VARCHAR(254) NOT NULL CHECK (btrim(email) <> '') CHECK (email = lower(email)),
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  role TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Restaurant business profiles.
CREATE TABLE IF NOT EXISTS restaurants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  name VARCHAR(160) NOT NULL CHECK (btrim(name) <> ''),
  slug VARCHAR(180) NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description VARCHAR(2000) NOT NULL CHECK (btrim(description) <> ''),
  logo_url TEXT,
  cover_image_url TEXT,
  phone VARCHAR(32) NOT NULL CHECK (btrim(phone) <> ''),
  email VARCHAR(254) NOT NULL CHECK (btrim(email) <> ''),
  address VARCHAR(500) NOT NULL CHECK (btrim(address) <> ''),
  city VARCHAR(120) NOT NULL CHECK (btrim(city) <> ''),
  country VARCHAR(120) NOT NULL CHECK (btrim(country) <> ''),
  currency CHAR(3) NOT NULL DEFAULT 'MYR' CHECK (currency ~ '^[A-Z]{3}$'),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'disabled')),
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  CONSTRAINT restaurants_owner_id_key UNIQUE (owner_id),
  CONSTRAINT restaurants_publication_timestamp_check CHECK (NOT is_published OR published_at IS NOT NULL)
);

-- Owner-managed menu categories. Ordering is explicit and scoped per restaurant.
CREATE TABLE IF NOT EXISTS menu_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  name VARCHAR(120) NOT NULL CHECK (btrim(name) <> ''),
  description VARCHAR(2000),
  display_order INTEGER NOT NULL CHECK (display_order >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT menu_categories_restaurant_name_key UNIQUE (restaurant_id, name),
  CONSTRAINT menu_categories_id_restaurant_key UNIQUE (id, restaurant_id)
);

-- Menu items inherit currency from their restaurant. The composite foreign key
-- prevents an item from referencing a category owned by another restaurant.
CREATE TABLE IF NOT EXISTS menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  category_id UUID NOT NULL,
  name VARCHAR(120) NOT NULL CHECK (btrim(name) <> ''),
  description VARCHAR(2000),
  price NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INTEGER NOT NULL CHECK (display_order >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT menu_items_id_restaurant_key UNIQUE (id, restaurant_id),
  CONSTRAINT menu_items_id_category_restaurant_key UNIQUE (id, category_id, restaurant_id),
  CONSTRAINT menu_items_category_restaurant_fk
    FOREIGN KEY (category_id, restaurant_id)
    REFERENCES menu_categories(id, restaurant_id)
    ON UPDATE CASCADE ON DELETE RESTRICT
);

-- Provider-neutral video metadata. Binary objects live in S3-compatible storage.
CREATE TABLE IF NOT EXISTS media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  menu_item_id UUID NOT NULL,
  media_type TEXT NOT NULL DEFAULT 'video' CHECK (media_type = 'video'),
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'ready', 'failed', 'deleted')),
  video_storage_key TEXT NOT NULL UNIQUE CHECK (btrim(video_storage_key) <> ''),
  video_url TEXT,
  thumbnail_storage_key TEXT UNIQUE,
  thumbnail_url TEXT,
  original_filename VARCHAR(255),
  mime_type TEXT NOT NULL CHECK (mime_type IN ('video/mp4', 'video/webm')),
  size_bytes BIGINT CHECK (size_bytes > 0),
  duration_seconds NUMERIC(8,3) CHECK (duration_seconds > 0 AND duration_seconds <= 120),
  width INTEGER,
  height INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT media_assets_item_restaurant_fk
    FOREIGN KEY (menu_item_id, restaurant_id)
    REFERENCES menu_items(id, restaurant_id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT media_assets_ready_fields_check CHECK (status <> 'ready' OR (video_url IS NOT NULL AND thumbnail_url IS NOT NULL AND size_bytes IS NOT NULL AND duration_seconds IS NOT NULL)),
  CONSTRAINT media_assets_dimensions_check CHECK ((width IS NULL AND height IS NULL) OR (width > 0 AND height > 0))
);

-- Restaurant tables use stable, globally unique public QR tokens. Deactivation
-- preserves the token so an old QR can never be reassigned to another table.
CREATE TABLE IF NOT EXISTS restaurant_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  name VARCHAR(100) NOT NULL CHECK (btrim(name) <> ''),
  code VARCHAR(20) NOT NULL CHECK (code ~ '^[A-Z0-9_-]+$'),
  qr_token UUID NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT restaurant_tables_restaurant_name_key UNIQUE (restaurant_id, name),
  CONSTRAINT restaurant_tables_restaurant_code_key UNIQUE (restaurant_id, code),
  CONSTRAINT restaurant_tables_id_restaurant_key UNIQUE (id, restaurant_id)
);

-- Minimal immutable trail for sensitive platform-admin mutations. target_id is
-- polymorphic across users/restaurants, so application services validate it.
CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK (action IN ('OWNER_STATUS_CHANGED', 'RESTAURANT_STATUS_CHANGED', 'OWNER_ROLE_CHANGED', 'ADMIN_ROLE_CHANGED', 'USER_STATUS_CHANGED')),
  target_type TEXT NOT NULL CHECK (target_type IN ('user', 'restaurant')),
  target_id UUID NOT NULL,
  old_values JSONB NOT NULL,
  new_values JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Anonymous diner sessions and append-only engagement events. No personal diner
-- identity or IP address is persisted.
CREATE TABLE IF NOT EXISTS analytics_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token UUID NOT NULL UNIQUE,
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  table_id UUID NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT analytics_sessions_table_restaurant_fk FOREIGN KEY (table_id, restaurant_id) REFERENCES restaurant_tables(id, restaurant_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT analytics_sessions_context_key UNIQUE (id, restaurant_id, table_id)
);

CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL,
  restaurant_id UUID NOT NULL,
  table_id UUID NOT NULL,
  category_id UUID,
  menu_item_id UUID,
  event_type TEXT NOT NULL CHECK (event_type IN ('MENU_VIEW','ITEM_IMPRESSION','VIDEO_OPEN','VIDEO_PLAY','VIDEO_PROGRESS','VIDEO_COMPLETE','ADD_TO_SELECTION','REMOVE_FROM_SELECTION','SHOW_WAITER')),
  watch_duration_seconds NUMERIC(8,2) CHECK (watch_duration_seconds >= 0 AND watch_duration_seconds <= 120),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT analytics_events_session_context_fk FOREIGN KEY (session_id, restaurant_id, table_id) REFERENCES analytics_sessions(id, restaurant_id, table_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT analytics_events_item_context_fk FOREIGN KEY (menu_item_id, category_id, restaurant_id) REFERENCES menu_items(id, category_id, restaurant_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT analytics_events_item_pair_check CHECK ((menu_item_id IS NULL) = (category_id IS NULL))
);

-- Supporting indexes (unique constraints already create their own indexes).
CREATE INDEX IF NOT EXISTS users_role_idx ON users (role);
CREATE INDEX IF NOT EXISTS users_status_idx ON users (status);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx ON users (lower(email));
CREATE INDEX IF NOT EXISTS users_created_at_idx ON users (created_at DESC);
CREATE INDEX IF NOT EXISTS restaurants_public_lookup_idx ON restaurants (slug) WHERE status = 'active' AND is_published = TRUE;
CREATE INDEX IF NOT EXISTS restaurants_status_idx ON restaurants (status);
CREATE INDEX IF NOT EXISTS restaurants_created_at_idx ON restaurants (created_at DESC);
CREATE INDEX IF NOT EXISTS menu_categories_restaurant_order_idx ON menu_categories (restaurant_id, display_order);
CREATE INDEX IF NOT EXISTS menu_items_restaurant_idx ON menu_items (restaurant_id);
CREATE INDEX IF NOT EXISTS menu_items_category_order_idx ON menu_items (category_id, display_order);
CREATE INDEX IF NOT EXISTS menu_items_restaurant_active_idx ON menu_items (restaurant_id, is_active);
CREATE UNIQUE INDEX IF NOT EXISTS media_assets_one_ready_per_item_idx ON media_assets (menu_item_id) WHERE status = 'ready';
CREATE INDEX IF NOT EXISTS media_assets_restaurant_idx ON media_assets (restaurant_id);
CREATE INDEX IF NOT EXISTS media_assets_status_idx ON media_assets (status);
CREATE INDEX IF NOT EXISTS restaurant_tables_restaurant_active_idx ON restaurant_tables (restaurant_id, is_active);
CREATE INDEX IF NOT EXISTS restaurants_published_idx ON restaurants (is_published);
CREATE INDEX IF NOT EXISTS admin_audit_logs_admin_idx ON admin_audit_logs (admin_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_logs_target_idx ON admin_audit_logs (target_type, target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_logs_created_at_idx ON admin_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_restaurant_created_idx ON analytics_events (restaurant_id, created_at);
CREATE INDEX IF NOT EXISTS analytics_events_restaurant_type_created_idx ON analytics_events (restaurant_id, event_type, created_at);
CREATE INDEX IF NOT EXISTS analytics_events_item_created_idx ON analytics_events (menu_item_id, created_at) WHERE menu_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS analytics_events_category_created_idx ON analytics_events (category_id, created_at) WHERE category_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS analytics_events_table_created_idx ON analytics_events (table_id, created_at);
CREATE INDEX IF NOT EXISTS analytics_events_session_idx ON analytics_events (session_id);

COMMENT ON CONSTRAINT restaurants_owner_id_key ON restaurants IS
  'V1 one-restaurant-per-owner rule; drop this constraint when multi-restaurant ownership is enabled.';
