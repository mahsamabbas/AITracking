-- 009 — Remove the demo-only connector state.
--
-- `demo_state` let seeded connectors be re-anchored to look online and hid
-- some rows from coverage math. Connector health must come only from real
-- heartbeats, so the column and every code path that read it are removed.
ALTER TABLE connector_health DROP COLUMN IF EXISTS demo_state;
