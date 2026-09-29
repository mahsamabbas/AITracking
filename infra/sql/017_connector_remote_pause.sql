-- A pause set from the dashboard is stored separately from the pause state a
-- connector reports in its heartbeat. Before, every heartbeat overwrote
-- `paused` with the connector's own flag, so a dashboard pause reverted within
-- 30 seconds and collection never stopped.
ALTER TABLE connector_health ADD COLUMN IF NOT EXISTS remote_paused SMALLINT NOT NULL DEFAULT 0;
