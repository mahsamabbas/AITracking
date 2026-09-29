-- Data retention: keep the database small no matter how long it runs.
--
-- Raw activity_events are kept RAW_RETENTION_DAYS (default 14). Before a day
-- is removed it is (1) summarised into activity_hourly — the event-time
-- engine's output per person and UTC hour, which is all any chart needs — and
-- (2) archived to object storage as a verified gzip JSON Lines file. Charts
-- read summaries before retention_state.summarized_before and raw events
-- after it, so no range is ever blank or double counted.

CREATE TABLE IF NOT EXISTS activity_hourly (
  organization_id UUID NOT NULL,
  developer_id    UUID NOT NULL,
  hour_start      TIMESTAMPTZ NOT NULL,
  active_ms       INT NOT NULL DEFAULT 0,
  idle_ms         INT NOT NULL DEFAULT 0,
  working_ms      INT NOT NULL DEFAULT 0,
  verify_ms       INT NOT NULL DEFAULT 0,
  writing_ms      INT NOT NULL DEFAULT 0,
  research_ms     INT NOT NULL DEFAULT 0,
  model_requests  INT NOT NULL DEFAULT 0,
  tool_calls      INT NOT NULL DEFAULT 0,
  file_changes    INT NOT NULL DEFAULT 0,
  -- provider → [active, idle, working, verify, writing, research, model, tool, file]
  by_provider     JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- workspace folder name → agent file changes that hour
  workspaces      JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (organization_id, hour_start, developer_id)
);

CREATE TABLE IF NOT EXISTS retention_state (
  organization_id   UUID PRIMARY KEY,
  -- Every UTC day before this instant is summarised in activity_hourly.
  summarized_before TIMESTAMPTZ NOT NULL,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Lifecycle of each UTC day: summarised → archived → raw rows removed.
CREATE TABLE IF NOT EXISTS retention_days (
  organization_id UUID NOT NULL,
  day             DATE NOT NULL,
  rolled_up_at    TIMESTAMPTZ,
  rollup_events   INT,
  archived_at     TIMESTAMPTZ,
  purged_at       TIMESTAMPTZ,
  PRIMARY KEY (organization_id, day)
);

-- Manifest of archive files (the files themselves live in object storage).
CREATE TABLE IF NOT EXISTS data_archives (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  kind            TEXT NOT NULL,            -- events | sessions
  day             DATE NOT NULL,
  path            TEXT NOT NULL UNIQUE,
  rows            INT NOT NULL,
  bytes           INT NOT NULL,
  sha256          TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS data_archives_org_day_idx ON data_archives (organization_id, kind, day);

-- One row per background job: a lease (no two runs at once) and the last report.
CREATE TABLE IF NOT EXISTS maintenance_runs (
  job          TEXT PRIMARY KEY,
  locked_until TIMESTAMPTZ,
  last_run_at  TIMESTAMPTZ,
  last_report  JSONB
);
