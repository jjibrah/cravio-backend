CREATE TABLE restaurant_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  name VARCHAR(100) NOT NULL CHECK (btrim(name) <> ''),
  code VARCHAR(20) NOT NULL CHECK (code ~ '^[A-Z0-9_-]+$'),
  qr_token UUID NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT restaurant_tables_restaurant_name_key UNIQUE (restaurant_id, name),
  CONSTRAINT restaurant_tables_restaurant_code_key UNIQUE (restaurant_id, code)
);

CREATE INDEX restaurant_tables_restaurant_active_idx ON restaurant_tables (restaurant_id, is_active);
