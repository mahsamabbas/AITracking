-- 008 — Neutralise credentials that earlier migrations planted in every database.
--
-- Migrations 002 and 004 used to insert five portal users with published
-- passwords (manager123, admin123, ...) and a device authenticated by the
-- literal token "dev-device-token". Any database migrated before this file
-- still holds them. This migration:
--
--   * disables portal users whose hash still equals a published demo password
--     (the row stays, so audit history keeps its actor ids);
--   * revokes the shared dev device.
--
-- Local dev mode (TECHLIO_DEV_MODE=1) restores the demo users on API boot, and
-- `pnpm db:seed` recreates the dev device. Production must create a real
-- administrator first:  DATABASE_URL=... pnpm admin:create
UPDATE portal_users
SET password_hash = '!disabled-default-credential'
WHERE password_hash IN (
  '7944d0e9050aaf0eb8b5440daf0680f4d40c243cd6893f7336d1c952758d7693', -- manager123
  '9b1da24f47b7c55ba48e11b72745280ab7c1f77300c525fcdb6eaa73d6adce68', -- developer123
  'a797291477b881b7ce6e205716292b923b9ff1886725ab73e72d9326efee495e', -- admin123
  '4851f4eb86fe570574aea226fd2a1aa1c0a71dd02826c3d01edb6d99c8f0a01a'  -- auditor123
);

UPDATE devices
SET revoked_at = NOW()
WHERE revoked_at IS NULL
  AND token_hash = encode(digest('dev-device-token', 'sha256'), 'hex');

INSERT INTO audit_log (organization_id, action, detail, created_at)
SELECT id, 'security.default_credentials_disabled',
       '{"migration":"008_disable_default_credentials"}'::jsonb, NOW()
FROM organizations;
