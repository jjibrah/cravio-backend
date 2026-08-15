ALTER TABLE restaurant_tables
ADD CONSTRAINT restaurant_tables_id_restaurant_key UNIQUE (id, restaurant_id);

ALTER TABLE menu_items
ADD CONSTRAINT menu_items_id_category_restaurant_key UNIQUE (id, category_id, restaurant_id);

CREATE TABLE analytics_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token UUID NOT NULL UNIQUE,
  restaurant_id UUID NOT NULL REFERENCES restaurants (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  table_id UUID NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT analytics_sessions_table_restaurant_fk FOREIGN KEY (table_id, restaurant_id) REFERENCES restaurant_tables (id, restaurant_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT analytics_sessions_context_key UNIQUE (id, restaurant_id, table_id)
);

CREATE TABLE analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL,
  restaurant_id UUID NOT NULL,
  table_id UUID NOT NULL,
  category_id UUID,
  menu_item_id UUID,
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'MENU_VIEW',
      'ITEM_IMPRESSION',
      'VIDEO_OPEN',
      'VIDEO_PLAY',
      'VIDEO_PROGRESS',
      'VIDEO_COMPLETE',
      'ADD_TO_SELECTION',
      'REMOVE_FROM_SELECTION',
      'SHOW_WAITER'
    )
  ),
  watch_duration_seconds NUMERIC(8, 2) CHECK (
    watch_duration_seconds >= 0
    AND watch_duration_seconds <= 120
  ),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT analytics_events_session_context_fk FOREIGN KEY (session_id, restaurant_id, table_id) REFERENCES analytics_sessions (id, restaurant_id, table_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT analytics_events_item_context_fk FOREIGN KEY (menu_item_id, category_id, restaurant_id) REFERENCES menu_items (id, category_id, restaurant_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT analytics_events_item_pair_check CHECK ((menu_item_id IS NULL) = (category_id IS NULL))
);

CREATE INDEX analytics_events_restaurant_created_idx ON analytics_events (restaurant_id, created_at);

CREATE INDEX analytics_events_restaurant_type_created_idx ON analytics_events (restaurant_id, event_type, created_at);

CREATE INDEX analytics_events_item_created_idx ON analytics_events (menu_item_id, created_at)
WHERE
  menu_item_id IS NOT NULL;

CREATE INDEX analytics_events_category_created_idx ON analytics_events (category_id, created_at)
WHERE
  category_id IS NOT NULL;

CREATE INDEX analytics_events_table_created_idx ON analytics_events (table_id, created_at);

CREATE INDEX analytics_events_session_idx ON analytics_events (session_id);
