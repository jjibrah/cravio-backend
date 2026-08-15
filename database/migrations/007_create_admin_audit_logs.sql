CREATE TABLE admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES users (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK (
    action IN (
      'OWNER_STATUS_CHANGED',
      'RESTAURANT_STATUS_CHANGED',
      'OWNER_ROLE_CHANGED',
      'USER_STATUS_CHANGED'
    )
  ),
  target_type TEXT NOT NULL CHECK (target_type IN ('user', 'restaurant')),
  target_id UUID NOT NULL,
  old_values JSONB NOT NULL,
  new_values JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX admin_audit_logs_admin_idx ON admin_audit_logs (admin_user_id, created_at DESC);

CREATE INDEX admin_audit_logs_target_idx ON admin_audit_logs (target_type, target_id, created_at DESC);

CREATE INDEX admin_audit_logs_created_at_idx ON admin_audit_logs (created_at DESC);

CREATE INDEX restaurants_published_idx ON restaurants (is_published);
