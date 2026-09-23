-- 010 — Attribute Tier B provider reports to the right person.
--
-- Cursor and Copilot report usage per *provider account*, not per Techlio
-- employee. Before this migration the worker attributed every row in the org
-- to one hard-coded developer. Now a row is attributed only when the provider
-- account maps to an employee; unmapped rows are skipped and counted.
--
--   * Cursor rows carry the account email and map to employees.email by default.
--   * Copilot rows carry only a GitHub login, which needs an explicit mapping.
CREATE TABLE IF NOT EXISTS employee_provider_identities (
  organization_id UUID NOT NULL,
  employee_id     UUID NOT NULL,
  provider        TEXT NOT NULL,
  external_id     TEXT NOT NULL,          -- lower-cased email or login
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organization_id, provider, external_id)
);

-- A provider pull needs a device id on its events (FR-003 schema), but it is
-- not a connector: it has no heartbeat and must never appear as an "offline"
-- installation or count toward connector coverage.
ALTER TABLE devices ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'connector';
CREATE INDEX IF NOT EXISTS devices_kind_idx ON devices (organization_id, kind);
