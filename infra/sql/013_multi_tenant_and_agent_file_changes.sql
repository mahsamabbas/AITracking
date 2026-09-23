-- 013 — Multi-tenant platform + agent-only file changes + activity feed index.
--
-- 1. Organisations become tenants managed by a platform super admin. The
--    super admin's own account lives in a "platform" organisation that never
--    holds monitored people.
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS kind        TEXT        NOT NULL DEFAULT 'customer'; -- customer | platform
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ;

-- 2. The activity feed pages through one organisation's events by time.
CREATE INDEX IF NOT EXISTS activity_events_org_occurred_idx
  ON activity_events (organization_id, occurred_at DESC);

-- 3. File changes and test/build checks count only when an AI agent reported
--    them (the agent hook names the tool or marks its source). IDE-companion
--    save/typing/task events were a person's own work and were being counted
--    as AI file changes; recompute the stored per-session totals without them.
WITH agent AS (
  SELECT e.session_id,
         COUNT(*) FILTER (WHERE e.event_type LIKE 'file\_%')                         AS file_changes,
         COUNT(*) FILTER (WHERE e.event_type = 'test_completed')                      AS tests_run,
         COALESCE(SUM((e.payload->'metadata'->>'test_passed')::int)
                  FILTER (WHERE e.event_type = 'test_completed'), 0)                  AS tests_passed,
         COALESCE(SUM((e.payload->'metadata'->>'test_failed')::int)
                  FILTER (WHERE e.event_type = 'test_completed'), 0)                  AS tests_failed,
         COUNT(*) FILTER (WHERE e.event_type = 'build_completed')                     AS builds_run,
         COUNT(*) FILTER (WHERE e.event_type = 'build_completed'
                            AND e.payload->>'status' = 'failed')                      AS builds_failed
  FROM activity_events e
  WHERE e.session_id IS NOT NULL
    AND (e.event_type LIKE 'file\_%' OR e.event_type IN ('test_completed', 'build_completed'))
    AND (e.payload->'metadata'->>'tool_name' IS NOT NULL
         OR e.payload->'metadata'->>'telemetry_source' IN ('hook', 'otel', 'provider_api'))
  GROUP BY e.session_id
)
UPDATE agent_sessions s
SET file_changes  = COALESCE(a.file_changes, 0),
    tests_run     = COALESCE(a.tests_run, 0),
    tests_passed  = COALESCE(a.tests_passed, 0),
    tests_failed  = COALESCE(a.tests_failed, 0),
    builds_run    = COALESCE(a.builds_run, 0),
    builds_failed = COALESCE(a.builds_failed, 0),
    classification = CASE
      WHEN s.classification = 'idle_dominant' THEN s.classification
      WHEN COALESCE(a.tests_run, 0) + COALESCE(a.builds_run, 0) > 0 THEN 'engineering_output'
      WHEN COALESCE(a.file_changes, 0) > 0 THEN 'assisted_editing'
      ELSE 'exploration'
    END
FROM agent_sessions s2
LEFT JOIN agent a ON a.session_id = s2.id
WHERE s.id = s2.id
  AND (s.file_changes <> COALESCE(a.file_changes, 0)
       OR s.tests_run <> COALESCE(a.tests_run, 0)
       OR s.builds_run <> COALESCE(a.builds_run, 0));
