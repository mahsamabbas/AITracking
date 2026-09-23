-- 011 — Remove "agent sessions" that contain no agent activity.
--
-- The connector stamps heartbeats with its current session id, and ingest used
-- to open a session for any event carrying one. Sessions made only of
-- heartbeat / connector-health / coverage events inflated session counts with
-- periods in which the agent did nothing. Ingest no longer creates them; this
-- removes the ones already stored. Their events are kept (session_id is left
-- as-is on the events for traceability; there is no foreign key).
DELETE FROM agent_sessions s
WHERE NOT EXISTS (
  SELECT 1 FROM activity_events e
  WHERE e.session_id = s.id
    AND (
      e.event_type LIKE 'session\_%' OR e.event_type = 'task_context_changed'
      OR e.event_type LIKE 'model\_%' OR e.event_type LIKE 'tool\_%'
      OR e.event_type LIKE 'test\_%' OR e.event_type LIKE 'build\_%'
      OR e.event_type LIKE 'lint\_%' OR e.event_type LIKE 'typecheck\_%'
      OR e.event_type LIKE 'file\_%'
    )
)
AND NOT EXISTS (SELECT 1 FROM session_context_versions v WHERE v.session_id = s.id);
