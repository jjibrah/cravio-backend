CREATE TABLE restaurants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users (id) ON UPDATE CASCADE ON DELETE RESTRICT,
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
  CONSTRAINT restaurants_publication_timestamp_check CHECK (
    NOT is_published
    OR published_at IS NOT NULL
  )
);

CREATE INDEX restaurants_public_lookup_idx ON restaurants (slug)
WHERE
  status = 'active'
  AND is_published = TRUE;

CREATE INDEX restaurants_status_idx ON restaurants (status);

CREATE INDEX restaurants_created_at_idx ON restaurants (created_at DESC);

COMMENT ON CONSTRAINT restaurants_owner_id_key ON restaurants IS 'V1 one-restaurant-per-owner rule; drop this constraint when multi-restaurant ownership is enabled.';
