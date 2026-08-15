ALTER TABLE users
ADD COLUMN email VARCHAR(254),
ADD COLUMN first_name VARCHAR(100),
ADD COLUMN last_name VARCHAR(100);

UPDATE users
SET
  email = lower(clerk_user_id) || '@legacy.invalid'
WHERE
  email IS NULL;

ALTER TABLE users
ALTER COLUMN email
SET NOT NULL,
ALTER COLUMN role
SET DEFAULT 'owner';

ALTER TABLE users
ADD CONSTRAINT users_email_not_blank CHECK (btrim(email) <> ''),
ADD CONSTRAINT users_email_lowercase CHECK (email = lower(email));

CREATE UNIQUE INDEX users_email_unique_idx ON users (lower(email));

CREATE INDEX users_created_at_idx ON users (created_at DESC);
