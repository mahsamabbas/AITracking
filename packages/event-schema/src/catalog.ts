/** Section 10 — approved event catalog (additive evolution only). */
export const SCHEMA_VERSION = "1.0.0";

export const EventTypes = {
  connector_started: "connector_started",
  connector_stopped: "connector_stopped",
  heartbeat_sent: "heartbeat_sent",
  connector_paused: "connector_paused",
  connector_resumed: "connector_resumed",
  update_required: "update_required",
  upload_failed: "upload_failed",
  upload_recovered: "upload_recovered",
  session_started: "session_started",
  session_heartbeat: "session_heartbeat",
  session_paused: "session_paused",
  session_resumed: "session_resumed",
  session_ended: "session_ended",
  task_context_changed: "task_context_changed",
  model_request_started: "model_request_started",
  model_request_completed: "model_request_completed",
  tool_started: "tool_started",
  tool_completed: "tool_completed",
  test_started: "test_started",
  test_completed: "test_completed",
  build_started: "build_started",
  build_completed: "build_completed",
  lint_started: "lint_started",
  lint_completed: "lint_completed",
  typecheck_started: "typecheck_started",
  typecheck_completed: "typecheck_completed",
  file_created: "file_created",
  file_modified: "file_modified",
  file_deleted: "file_deleted",
  /** A local git commit by this computer's git user in a repo an agent worked in. */
  commit_created: "commit_created",
  /** That commit reached the remote (it is on a remote-tracking branch). */
  commit_pushed: "commit_pushed",
  hour_opened: "hour_opened",
  hour_finalized: "hour_finalized",
  hour_recalculated: "hour_recalculated",
  summary_generated: "summary_generated",
  summary_failed: "summary_failed",
  telemetry_gap_started: "telemetry_gap_started",
  telemetry_gap_ended: "telemetry_gap_ended",
  provider_capability_missing: "provider_capability_missing",
  late_events_received: "late_events_received",
  unassigned_activity_detected: "unassigned_activity_detected",
  /** Tier B daily aggregate marker */
  provider_daily_aggregate: "provider_daily_aggregate",
} as const;

export type EventType = (typeof EventTypes)[keyof typeof EventTypes];

export const eventTypeSchema = [
  ...Object.values(EventTypes),
] as [EventType, ...EventType[]];
