CREATE TABLE menu_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  name VARCHAR(120) NOT NULL CHECK (btrim(name) <> ''),
  description VARCHAR(2000),
  display_order INTEGER NOT NULL CHECK (display_order >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT menu_categories_restaurant_name_key UNIQUE (restaurant_id, name),
  CONSTRAINT menu_categories_id_restaurant_key UNIQUE (id, restaurant_id)
);

CREATE TABLE menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  category_id UUID NOT NULL,
  name VARCHAR(120) NOT NULL CHECK (btrim(name) <> ''),
  description VARCHAR(2000),
  price NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INTEGER NOT NULL CHECK (display_order >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT menu_items_category_restaurant_fk FOREIGN KEY (category_id, restaurant_id) REFERENCES menu_categories (id, restaurant_id) ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE INDEX menu_categories_restaurant_order_idx ON menu_categories (restaurant_id, display_order);

CREATE INDEX menu_items_restaurant_idx ON menu_items (restaurant_id);

CREATE INDEX menu_items_category_order_idx ON menu_items (category_id, display_order);

CREATE INDEX menu_items_restaurant_active_idx ON menu_items (restaurant_id, is_active);
