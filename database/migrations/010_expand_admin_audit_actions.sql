ALTER TABLE admin_audit_logs DROP CONSTRAINT admin_audit_logs_action_check;
ALTER TABLE admin_audit_logs ADD CONSTRAINT admin_audit_logs_action_check
  CHECK (action IN ('OWNER_STATUS_CHANGED', 'RESTAURANT_STATUS_CHANGED', 'OWNER_ROLE_CHANGED', 'ADMIN_ROLE_CHANGED', 'USER_STATUS_CHANGED'));
