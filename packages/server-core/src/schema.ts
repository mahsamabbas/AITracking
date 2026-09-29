import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  integer,
  bigint,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  timezone: text("timezone").notNull().default("UTC"),
  logoUrl: text("logo_url"),
  aiPlanLimits: jsonb("ai_plan_limits"),
  /** "customer" tenants hold monitored people; the "platform" org holds super admins only. */
  kind: text("kind").notNull().default("customer"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
});

/** The monitored people. `id` is the developer_id carried on every event. */
export const employees = pgTable(
  "employees",
  {
    id: uuid("id").primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    displayName: text("display_name").notNull(),
    email: text("email"),
    team: text("team"),
    title: text("title"),
    status: text("status").notNull().default("active"),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("employees_org_idx").on(t.organizationId)],
);

export const activityEvents = pgTable(
  "activity_events",
  {
    eventId: uuid("event_id").primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    developerId: uuid("developer_id").notNull(),
    deviceId: uuid("device_id").notNull(),
    sessionId: uuid("session_id"),
    eventType: text("event_type").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    payload: jsonb("payload").notNull(),
  },
  (t) => [uniqueIndex("activity_events_event_id_idx").on(t.eventId)],
);

export const hourlySnapshots = pgTable("hourly_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull(),
  developerId: uuid("developer_id").notNull(),
  hourStart: timestamp("hour_start", { withTimezone: true }).notNull(),
  version: integer("version").notNull().default(1),
  metrics: jsonb("metrics").notNull(),
  completeness: text("completeness").notNull().default("complete"),
  recalcReason: text("recalc_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull(),
  actorId: uuid("actor_id"),
  action: text("action").notNull(),
  detail: jsonb("detail"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const connectorHealth = pgTable("connector_health", {
  deviceId: uuid("device_id").primaryKey(),
  organizationId: uuid("organization_id").notNull(),
  lastHeartbeat: timestamp("last_heartbeat", { withTimezone: true }),
  version: text("version"),
  queueDepth: integer("queue_depth"),
  paused: integer("paused").default(0),
  /** Pause requested from the dashboard; wins over the connector's own flag. */
  remotePaused: integer("remote_paused").default(0),
  provider: text("provider"),
  /** FR-012 — per-provider capability report from the connector. */
  capabilities: jsonb("capabilities"),
  capabilitiesAt: timestamp("capabilities_at", { withTimezone: true }),
});

export const devices = pgTable("devices", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id").notNull(),
  developerId: uuid("developer_id").notNull(),
  tokenHash: text("token_hash").notNull(),
  publicKey: text("public_key"),
  provider: text("provider"),
  label: text("label"),
  /** "connector" (heartbeating install) or "provider_pull" (Tier B report source). */
  kind: text("kind").notNull().default("connector"),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull(),
  name: text("name").notNull(),
  externalRef: text("external_ref"),
});

export const workItems = pgTable("work_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull(),
  projectId: uuid("project_id"),
  title: text("title").notNull(),
  externalRef: text("external_ref"),
});

export const agentSessions = pgTable(
  "agent_sessions",
  {
    id: uuid("id").primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    developerId: uuid("developer_id").notNull(),
    deviceId: uuid("device_id").notNull(),
    provider: text("provider").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    lastEventAt: timestamp("last_event_at", { withTimezone: true }),
    projectId: uuid("project_id"),
    workItemId: uuid("work_item_id"),
    unassigned: boolean("unassigned").notNull().default(false),

    /** §11 — the five durations are stored separately and never summed into one. */
    modelDurationMs: bigint("model_duration_ms", { mode: "number" }).notNull().default(0),
    toolDurationMs: bigint("tool_duration_ms", { mode: "number" }).notNull().default(0),
    activeDurationMs: bigint("active_duration_ms", { mode: "number" }).notNull().default(0),
    interactiveSpanMs: bigint("interactive_span_ms", { mode: "number" }).notNull().default(0),
    elapsedSpanMs: bigint("elapsed_span_ms", { mode: "number" }).notNull().default(0),
    idleDurationMs: bigint("idle_duration_ms", { mode: "number" }).notNull().default(0),

    eventCount: integer("event_count").notNull().default(0),
    modelRequests: integer("model_requests").notNull().default(0),
    toolCalls: integer("tool_calls").notNull().default(0),
    testsRun: integer("tests_run").notNull().default(0),
    testsPassed: integer("tests_passed").notNull().default(0),
    testsFailed: integer("tests_failed").notNull().default(0),
    buildsRun: integer("builds_run").notNull().default(0),
    buildsFailed: integer("builds_failed").notNull().default(0),
    fileChanges: integer("file_changes").notNull().default(0),
    failures: integer("failures").notNull().default(0),

    tokenInput: bigint("token_input", { mode: "number" }),
    tokenOutput: bigint("token_output", { mode: "number" }),

    modelsUsed: jsonb("models_used").notNull().default([]),
    toolCategories: jsonb("tool_categories").notNull().default({}),

    classification: text("classification").notNull().default("exploration"),
    coverageState: text("coverage_state").notNull().default("complete"),
    metricsAt: timestamp("metrics_at", { withTimezone: true }),
  },
  (t) => [
    index("agent_sessions_org_dev_started_idx").on(
      t.organizationId,
      t.developerId,
      t.startedAt,
    ),
  ],
);

export const sessionContextVersions = pgTable("session_context_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull(),
  organizationId: uuid("organization_id").notNull(),
  projectId: uuid("project_id"),
  workItemId: uuid("work_item_id"),
  label: text("label"),
  version: integer("version").notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
});

export const activityExports = pgTable("activity_exports", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull(),
  requestedBy: uuid("requested_by"),
  format: text("format").notNull(),
  status: text("status").notNull().default("ready"),
  content: text("content"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const portalUsers = pgTable("portal_users", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id").notNull(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  role: text("role").notNull(),
  developerId: uuid("developer_id"),
  avatarUrl: text("avatar_url"),
});
