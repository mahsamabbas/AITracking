import type { ActivityEvent } from "@techlio/event-schema";
import { activityTypeOf, isAgentReported, isEditorOnlyEvent } from "./activity.js";
import {
  computeHourlyDurations,
  DEFAULT_IDLE_THRESHOLD_MS,
  type TimeInterval,
} from "@techlio/aggregation";
import { randomUUID } from "node:crypto";
import { and, eq, gte, lt } from "drizzle-orm";
import { db } from "./db.js";
import { activityEvents, employees, hourlySnapshots } from "./schema.js";

const COVERAGE_EVENT_TYPES = new Set([
  "connector_paused",
  "telemetry_gap_started",
  "upload_failed",
  "update_required",
  "provider_capability_missing",
]);

function hourStartUtc(d: Date): Date {
  return new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
      d.getUTCHours(),
    ),
  );
}

export async function finalizeHourForDeveloper(
  organizationId: string,
  developerId: string,
  hour: Date,
  version = 1,
  recalcReason?: string,
): Promise<string> {
  const hourStart = hourStartUtc(hour);
  const hourEnd = new Date(hourStart.getTime() + 3600_000);

  const existing = await db
    .select({ id: hourlySnapshots.id })
    .from(hourlySnapshots)
    .where(
      and(
        eq(hourlySnapshots.organizationId, organizationId),
        eq(hourlySnapshots.developerId, developerId),
        eq(hourlySnapshots.hourStart, hourStart),
        eq(hourlySnapshots.version, version),
      ),
    )
    .limit(1);
  if (existing[0]) return existing[0].id;

  const rows = await db
    .select()
    .from(activityEvents)
    .where(
      and(
        eq(activityEvents.organizationId, organizationId),
        eq(activityEvents.developerId, developerId),
        gte(activityEvents.occurredAt, hourStart),
        lt(activityEvents.occurredAt, hourEnd),
      ),
    );

  const modelIntervals: TimeInterval[] = [];
  const toolIntervals: TimeInterval[] = [];
  const sessionTimes = new Map<string, number[]>();
  const eventIds: string[] = [];
  // null = no event in the hour reported token data (not the same as 0).
  let tokenInput: number | null = null;
  let tokenOutput: number | null = null;
  let testsCompleted = 0;
  let buildsCompleted = 0;
  let fileChanges = 0;
  const coverageGapEventIds: string[] = [];
  const coverageGapTypes = new Set<string>();

  for (const row of rows) {
    eventIds.push(row.eventId);
    if (COVERAGE_EVENT_TYPES.has(row.eventType)) {
      coverageGapEventIds.push(row.eventId);
      coverageGapTypes.add(row.eventType);
    }
    const p = row.payload as {
      event_type?: string;
      occurred_at?: string;
      duration_ms?: number;
      session_id?: string;
      metadata?: {
        token_input?: number;
        token_output?: number;
      };
    };
    // A person's own saves / task runs (IDE companion) are not AI work.
    if (isEditorOnlyEvent(p as unknown as ActivityEvent) || p.event_type === "session_heartbeat") continue;
    // occurred_at is the completion time: a call spans [t - duration, t], the
    // same convention as computeSessionMetrics, so hourly and session totals agree.
    const at = new Date(p.occurred_at ?? row.occurredAt).getTime();
    const interval = { startMs: at - (p.duration_ms ?? 0), endMs: at };
    if (p.event_type === "model_request_completed") modelIntervals.push(interval);
    if (
      p.event_type === "tool_completed" ||
      p.event_type === "test_completed" ||
      p.event_type === "build_completed"
    ) {
      toolIntervals.push(interval);
    }
    if (p.metadata?.token_input != null) tokenInput = (tokenInput ?? 0) + p.metadata.token_input;
    if (p.metadata?.token_output != null) tokenOutput = (tokenOutput ?? 0) + p.metadata.token_output;
    if (p.event_type === "test_completed") testsCompleted++;
    if (p.event_type === "build_completed") buildsCompleted++;
    if (
      (p.event_type === "file_created" ||
        p.event_type === "file_modified" ||
        p.event_type === "file_deleted") &&
      isAgentReported(p as { metadata?: { tool_name?: unknown; telemetry_source?: unknown } })
    ) {
      fileChanges++;
    }
    // Heartbeats and connector/coverage events are not agent activity; they
    // would make every powered-on hour look like an hour-long session.
    const kind = activityTypeOf(p.event_type ?? row.eventType);
    if (kind !== "connector" && kind !== "coverage") {
      const sid = p.session_id ?? row.sessionId ?? "unknown";
      const arr = sessionTimes.get(sid) ?? [];
      arr.push(at);
      sessionTimes.set(sid, arr);
    }
  }

  const durations = computeHourlyDurations({
    hourStartMs: hourStart.getTime(),
    modelIntervals,
    toolIntervals,
    sessions: [...sessionTimes.entries()].map(([sessionId, eventTimesMs]) => ({
      sessionId,
      eventTimesMs,
    })),
    idleThresholdMs: DEFAULT_IDLE_THRESHOLD_MS,
  });

  const metrics = {
    ...durations,
    tokenInput,
    tokenOutput,
    testsCompleted,
    buildsCompleted,
    fileChanges,
    eventIds,
    eventCount: rows.length,
    coverageGapEventIds,
    coverageGapTypes: [...coverageGapTypes],
  };

  const snapshotId = randomUUID();
  await db.insert(hourlySnapshots).values({
    id: snapshotId,
    organizationId,
    developerId,
    hourStart,
    version,
    metrics,
    completeness:
      rows.length === 0 || coverageGapEventIds.length > 0
        ? "partial"
        : "complete",
    recalcReason: recalcReason ?? null,
    createdAt: new Date(),
  });

  return snapshotId;
}

export async function listHourlyTargets(): Promise<
  { organizationId: string; developerId: string }[]
> {
  const rows = await db
    .select({
      organizationId: employees.organizationId,
      developerId: employees.id,
    })
    .from(employees)
    .where(eq(employees.status, "active"));
  return rows;
}
