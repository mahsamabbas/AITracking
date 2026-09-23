import { z } from "zod";
import { eventTypeSchema, SCHEMA_VERSION } from "./catalog.js";

export const EventStatus = z.enum([
  "started",
  "succeeded",
  "failed",
  "cancelled",
  "unknown",
]);

/** Allowlisted metadata keys only — SEC-001 / FR-008 */
export const MetadataSchema = z
  .object({
    model_name: z.string().optional(),
    provider_name: z.string().optional(),
    tool_category: z
      .enum([
        "file_read",
        "file_write",
        "shell",
        "search",
        "test",
        "build",
        "browser",
        "other",
      ])
      .optional(),
    tool_name: z.string().max(128).optional(),
    token_input: z.number().int().nonnegative().optional(),
    token_output: z.number().int().nonnegative().optional(),
    file_path: z.string().max(512).optional(),
    path_category: z.string().max(64).optional(),
    test_passed: z.number().int().nonnegative().optional(),
    test_failed: z.number().int().nonnegative().optional(),
    tier: z.enum(["A", "B"]).optional(),
    daily_only: z.boolean().optional(),
    queue_depth: z.number().int().nonnegative().optional(),
    connector_paused: z.boolean().optional(),
    /** "stopped" = the employee stopped the connector from the tray / menu bar. */
    gap_reason: z.enum(["paused", "offline", "heartbeat_missing", "stopped"]).optional(),
    /** Tier B provider pull (Cursor Admin / Analytics, Copilot reports) */
    aggregate_kind: z
      .enum([
        "daily_usage",
        "team_dau",
        "team_agent_edits",
        "user_agent_edits",
        "copilot_user_day",
      ])
      .optional(),
    aggregate_day: z.string().max(32).optional(),
    provider_user_id: z.string().max(64).optional(),
    external_login: z.string().max(64).optional(),
    lines_added: z.number().int().nonnegative().optional(),
    lines_deleted: z.number().int().nonnegative().optional(),
    completions_count: z.number().int().nonnegative().optional(),
    chat_requests_count: z.number().int().nonnegative().optional(),
    /** Cursor agent + composer requests (daily report). */
    agent_requests_count: z.number().int().nonnegative().optional(),
    /** Requests Cursor bills against the plan: included + usage-based + API-key. */
    billable_requests_count: z.number().int().nonnegative().optional(),
    suggestions_count: z.number().int().nonnegative().optional(),
    acceptances_count: z.number().int().nonnegative().optional(),
    lines_suggested: z.number().int().nonnegative().optional(),
    lines_accepted: z.number().int().nonnegative().optional(),
    chat_turns: z.number().int().nonnegative().optional(),
    chat_insertions: z.number().int().nonnegative().optional(),
    dau: z.number().int().nonnegative().optional(),
    cli_dau: z.number().int().nonnegative().optional(),
    cloud_agent_dau: z.number().int().nonnegative().optional(),
    total_accepts: z.number().int().nonnegative().optional(),
    total_rejects: z.number().int().nonnegative().optional(),
    capabilities_missing: z.string().max(256).optional(),
    /** Where the event came from — lineage for every derived metric. */
    telemetry_source: z.enum(["hook", "otel", "provider_api", "companion", "connector"]).optional(),
    /** Prompt-cache token counts reported by OpenTelemetry (never content). */
    cache_read_tokens: z.number().int().nonnegative().optional(),
    cache_creation_tokens: z.number().int().nonnegative().optional(),
  })
  .strict();

export const ActivityEventSchema = z.object({
  event_id: z.string().uuid(),
  schema_version: z.literal(SCHEMA_VERSION),
  organization_id: z.string().uuid(),
  developer_id: z.string().uuid(),
  device_id: z.string().uuid(),
  provider: z.string().min(1).max(64),
  connector_version: z.string().min(1).max(32),
  project_id: z.string().uuid().optional(),
  work_item_id: z.string().uuid().optional(),
  session_id: z.string().uuid().optional(),
  event_type: z.enum(eventTypeSchema),
  occurred_at: z.string().datetime(),
  received_at: z.string().datetime().optional(),
  duration_ms: z.number().int().nonnegative().optional(),
  status: EventStatus.optional(),
  metadata: MetadataSchema.optional(),
  content_fingerprint: z.string().max(128).optional(),
  consent_version: z.string().min(1),
});

export type ActivityEvent = z.infer<typeof ActivityEventSchema>;

export const EventBatchSchema = z.object({
  events: z.array(ActivityEventSchema).min(1).max(500),
});

export type EventBatch = z.infer<typeof EventBatchSchema>;
