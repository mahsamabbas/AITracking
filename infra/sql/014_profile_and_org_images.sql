-- Profile avatars and organisation logos (stored as data URLs, size capped in API).

ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS logo_url text;
