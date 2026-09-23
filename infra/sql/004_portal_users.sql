CREATE TABLE IF NOT EXISTS portal_users (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL,
  developer_id UUID
);

-- Portal users are created by `pnpm admin:create` (production) or by the
-- dev-mode API boot (local only). No default passwords ship in migrations.
