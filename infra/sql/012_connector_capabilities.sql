-- 012 — FR-012: persist what each connector reports it can and cannot supply.
--
-- The connector sends, with every heartbeat, a per-provider report derived from
-- what it has actually observed (e.g. Claude Code reports token totals only
-- while its OpenTelemetry export reaches the connector). The dashboard reads
-- this live report first and falls back to the static catalog.
ALTER TABLE connector_health ADD COLUMN IF NOT EXISTS capabilities    JSONB;
ALTER TABLE connector_health ADD COLUMN IF NOT EXISTS capabilities_at TIMESTAMPTZ;
