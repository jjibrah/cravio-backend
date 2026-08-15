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
  CONSTRAINT menu_items_category_restaurant_fk
    FOREIGN KEY (category_id, restaurant_id)
    REFERENCES menu_categories(id, restaurant_id)
    ON UPDATE CASCADE ON DELETE RESTRICT
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

COMMENT ON CONSTRAINT restaurants_owner_id_key ON restaurants IS
  'V1 one-restaurant-per-owner rule; drop this constraint when multi-restaurant ownership is enabled.';
