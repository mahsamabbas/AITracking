import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { ActivityEvent } from "@techlio/event-schema";
import {
  mergeIntervals,
  totalDurationMs,
  type TimeInterval,
} from "@techlio/aggregation";
import { db } from "./db.js";
import { activityEvents, agentSessions, projects, workItems } from "./schema.js";
import {
  IDLE_THRESHOLD_MS,
  activityTypeOf,
  type SessionClassification,
} from "./activity.js";

export interface SessionMetrics {
  modelDurationMs: number;
  toolDurationMs: number;
  activeDurationMs: number;
  interactiveSpanMs: number;
  elapsedSpanMs: number;
  idleDurationMs: number;
  eventCount: number;
  modelRequests: number;
  toolCalls: number;
  testsRun: number;
  testsPassed: number;
  testsFailed: number;
  buildsRun: number;
  buildsFailed: number;
  fileChanges: number;
  failures: number;
  tokenInput: number | null;
  tokenOutput: number | null;
  modelsUsed: string[];
  toolCategories: Record<string, number>;
  classification: SessionClassification;
  coverageState: "complete" | "partial" | "gap";
  startedAt: Date | null;
  lastEventAt: Date | null;
}

/**
 * Derives every session metric from the raw event stream.
 *
 * §11 rules honoured here:
 *  - overlapping model/tool intervals are merged before active time is summed
 *  - interactive span excludes gaps longer than the idle threshold
 *  - elapsed span is measured independently and never merged with the others
 */
export function computeSessionMetrics(events: ActivityEvent[]): SessionMetrics {
  const modelIntervals: TimeInterval[] = [];
  const toolIntervals: TimeInterval[] = [];
  const times: number[] = [];
  const models = new Set<string>();
  const toolCategories: Record<string, number> = {};

  let modelRequests = 0;
  let toolCalls = 0;
  let testsRun = 0;
  let testsPassed = 0;
  let testsFailed = 0;
  let buildsRun = 0;
  let buildsFailed = 0;
  let fileChanges = 0;
  let failures = 0;
  let tokenInput = 0;
  let tokenOutput = 0;
  let sawTokens = false;
  let coverage: "complete" | "partial" | "gap" = "complete";

  for (const e of events) {
    const start = new Date(e.occurred_at).getTime();
    if (Number.isNaN(start)) continue;
    times.push(start);
    const type = activityTypeOf(e.event_type);

    if (type === "model") {
      if (e.event_type === "model_request_completed") {
        modelRequests++;
        modelIntervals.push({ startMs: start - (e.duration_ms ?? 0), endMs: start });
        if (e.metadata?.model_name) models.add(e.metadata.model_name);
        if (e.metadata?.token_input != null || e.metadata?.token_output != null) {
          sawTokens = true;
          tokenInput += e.metadata.token_input ?? 0;
          tokenOutput += e.metadata.token_output ?? 0;
        }
      }
    } else if (type === "tool") {
      if (e.event_type === "tool_completed") {
        toolCalls++;
        toolIntervals.push({ startMs: start - (e.duration_ms ?? 0), endMs: start });
        const cat = e.metadata?.tool_category ?? "other";
        toolCategories[cat] = (toolCategories[cat] ?? 0) + 1;
      }
    } else if (type === "engineering_check") {
      if (e.event_type === "test_completed") {
        testsRun++;
        testsPassed += e.metadata?.test_passed ?? 0;
        testsFailed += e.metadata?.test_failed ?? 0;
        toolIntervals.push({ startMs: start - (e.duration_ms ?? 0), endMs: start });
      }
      if (e.event_type === "build_completed") {
        buildsRun++;
        if (e.status === "failed") buildsFailed++;
        toolIntervals.push({ startMs: start - (e.duration_ms ?? 0), endMs: start });
      }
    } else if (type === "file_change") {
      fileChanges++;
    } else if (type === "coverage") {
      if (
        e.event_type === "telemetry_gap_started" ||
        e.event_type === "connector_paused"
      ) {
        coverage = "gap";
      } else if (
        e.event_type === "provider_capability_missing" &&
        coverage === "complete"
      ) {
        coverage = "partial";
      }
    }

    if (e.status === "failed") failures++;
  }

  const merged = mergeIntervals([...modelIntervals, ...toolIntervals]);
  const modelDurationMs = totalDurationMs(modelIntervals);
  const toolDurationMs = totalDurationMs(toolIntervals);
  const activeDurationMs = totalDurationMs(merged);

  times.sort((a, b) => a - b);
  const elapsedSpanMs =
    times.length > 1 ? times[times.length - 1] - times[0] : 0;

  let interactiveSpanMs = 0;
  if (times.length > 1) {
    let spanStart = times[0];
    let spanEnd = times[0];
    for (let i = 1; i < times.length; i++) {
      if (times[i] - spanEnd > IDLE_THRESHOLD_MS) {
        interactiveSpanMs += spanEnd - spanStart;
        spanStart = times[i];
      }
      spanEnd = times[i];
    }
    interactiveSpanMs += spanEnd - spanStart;
  }

  const idleDurationMs = Math.max(0, elapsedSpanMs - interactiveSpanMs);

  let classification: SessionClassification;
  if (idleDurationMs > elapsedSpanMs * 0.5 && elapsedSpanMs > 15 * 60_000) {
    classification = "idle_dominant";
  } else if (testsRun + buildsRun > 0) {
    classification = "engineering_output";
  } else if (fileChanges > 0) {
    classification = "assisted_editing";
  } else {
    classification = "exploration";
  }

  return {
    modelDurationMs,
    toolDurationMs,
    activeDurationMs,
    interactiveSpanMs,
    elapsedSpanMs,
    idleDurationMs,
    eventCount: events.length,
    modelRequests,
    toolCalls,
    testsRun,
    testsPassed,
    testsFailed,
    buildsRun,
    buildsFailed,
    fileChanges,
    failures,
    tokenInput: sawTokens ? tokenInput : null,
    tokenOutput: sawTokens ? tokenOutput : null,
    modelsUsed: [...models],
    toolCategories,
    classification,
    coverageState: coverage,
    startedAt: times.length ? new Date(times[0]) : null,
    lastEventAt: times.length ? new Date(times[times.length - 1]) : null,
  };
}

/** Recomputes and persists metrics for one session from its stored events. */
export async function recomputeSessionMetrics(
  organizationId: string,
  sessionId: string,
): Promise<void> {
  const rows = await db
    .select({ payload: activityEvents.payload })
    .from(activityEvents)
    .where(
      and(
        eq(activityEvents.organizationId, organizationId),
        eq(activityEvents.sessionId, sessionId),
      ),
    )
    .orderBy(asc(activityEvents.occurredAt));

  if (rows.length === 0) return;
  const events = rows.map((r) => r.payload as ActivityEvent);
  const m = computeSessionMetrics(events);

  await db
    .update(agentSessions)
    .set({
      modelDurationMs: m.modelDurationMs,
      toolDurationMs: m.toolDurationMs,
      activeDurationMs: m.activeDurationMs,
      interactiveSpanMs: m.interactiveSpanMs,
      elapsedSpanMs: m.elapsedSpanMs,
      idleDurationMs: m.idleDurationMs,
      eventCount: m.eventCount,
      modelRequests: m.modelRequests,
      toolCalls: m.toolCalls,
      testsRun: m.testsRun,
      testsPassed: m.testsPassed,
      testsFailed: m.testsFailed,
      buildsRun: m.buildsRun,
      buildsFailed: m.buildsFailed,
      fileChanges: m.fileChanges,
      failures: m.failures,
      tokenInput: m.tokenInput,
      tokenOutput: m.tokenOutput,
      modelsUsed: m.modelsUsed,
      toolCategories: m.toolCategories,
      classification: m.classification,
      coverageState: m.coverageState,
      lastEventAt: m.lastEventAt,
      metricsAt: new Date(),
    })
    .where(
      and(
        eq(agentSessions.id, sessionId),
        eq(agentSessions.organizationId, organizationId),
      ),
    );
}

export type SessionRow = typeof agentSessions.$inferSelect;

export interface SessionListFilters {
  organizationId: string;
  developerId?: string;
  developerIds?: string[];
  provider?: string;
  projectId?: string;
  workItemId?: string;
  classification?: string;
  coverageState?: string;
  /** 0–23 in the organization timezone. */
  clockHour?: number;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

function sessionConditions(f: SessionListFilters) {
  const conds = [eq(agentSessions.organizationId, f.organizationId)];
  if (f.developerId) conds.push(eq(agentSessions.developerId, f.developerId));
  if (f.developerIds?.length) {
    conds.push(inArray(agentSessions.developerId, f.developerIds));
  }
  if (f.provider) conds.push(eq(agentSessions.provider, f.provider));
  if (f.projectId) conds.push(eq(agentSessions.projectId, f.projectId));
  if (f.workItemId) conds.push(eq(agentSessions.workItemId, f.workItemId));
  if (f.classification) {
    conds.push(eq(agentSessions.classification, f.classification));
  }
  if (f.coverageState) {
    conds.push(eq(agentSessions.coverageState, f.coverageState));
  }
  if (f.clockHour != null && f.clockHour >= 0 && f.clockHour <= 23) {
    conds.push(
      sql`EXTRACT(HOUR FROM ${agentSessions.startedAt} AT TIME ZONE ${process.env.ORG_TIMEZONE ?? "UTC"}) = ${f.clockHour}`,
    );
  }
  if (f.from) conds.push(gte(agentSessions.startedAt, f.from));
  if (f.to) conds.push(lte(agentSessions.startedAt, f.to));
  return and(...conds);
}

export async function listSessions(f: SessionListFilters): Promise<{
  sessions: SessionRow[];
  total: number;
  /** Totals over every matching session, not just the returned page. */
  matched: { activeMs: number; fileChanges: number; testsRun: number };
}> {
  const where = sessionConditions(f);
  const [sessions, countRows] = await Promise.all([
    db
      .select()
      .from(agentSessions)
      .where(where)
      .orderBy(desc(agentSessions.startedAt))
      .limit(f.limit ?? 25)
      .offset(f.offset ?? 0),
    db
      .select({
        count: sql<number>`count(*)::int`,
        activeMs: sql<string>`coalesce(sum(${agentSessions.activeDurationMs}), 0)`,
        fileChanges: sql<string>`coalesce(sum(${agentSessions.fileChanges}), 0)`,
        testsRun: sql<string>`coalesce(sum(${agentSessions.testsRun}), 0)`,
      })
      .from(agentSessions)
      .where(where),
  ]);
  const agg = countRows[0];
  return {
    sessions,
    total: agg?.count ?? 0,
    matched: {
      activeMs: Number(agg?.activeMs ?? 0),
      fileChanges: Number(agg?.fileChanges ?? 0),
      testsRun: Number(agg?.testsRun ?? 0),
    },
  };
}

export const LATE_EVENT_MS = 5 * 60 * 1000;

export interface SessionDetail {
  session: SessionRow;
  project: { id: string; name: string } | null;
  workItem: { id: string; title: string } | null;
  events: (ActivityEvent & { late?: boolean })[];
  contextChanges: {
    version: number;
    projectId: string | null;
    workItemId: string | null;
    label: string | null;
    recordedAt: Date;
  }[];
  neighbours: { previousId: string | null; nextId: string | null };
}

export async function getSessionDetail(
  organizationId: string,
  sessionId: string,
): Promise<SessionDetail | null> {
  const rows = await db
    .select()
    .from(agentSessions)
    .where(
      and(
        eq(agentSessions.id, sessionId),
        eq(agentSessions.organizationId, organizationId),
      ),
    );
  const session = rows[0];
  if (!session) return null;

  const [eventRows, projectRows, workItemRows, prevRows, nextRows] =
    await Promise.all([
      db
        .select({ payload: activityEvents.payload, receivedAt: activityEvents.receivedAt, occurredAt: activityEvents.occurredAt })
        .from(activityEvents)
        .where(
          and(
            eq(activityEvents.organizationId, organizationId),
            eq(activityEvents.sessionId, sessionId),
          ),
        )
        .orderBy(asc(activityEvents.occurredAt))
        .limit(500),
      session.projectId
        ? db.select().from(projects).where(eq(projects.id, session.projectId))
        : Promise.resolve([]),
      session.workItemId
        ? db.select().from(workItems).where(eq(workItems.id, session.workItemId))
        : Promise.resolve([]),
      db
        .select({ id: agentSessions.id })
        .from(agentSessions)
        .where(
          and(
            eq(agentSessions.organizationId, organizationId),
            eq(agentSessions.developerId, session.developerId),
            sql`${agentSessions.startedAt} < ${session.startedAt}`,
          ),
        )
        .orderBy(desc(agentSessions.startedAt))
        .limit(1),
      db
        .select({ id: agentSessions.id })
        .from(agentSessions)
        .where(
          and(
            eq(agentSessions.organizationId, organizationId),
            eq(agentSessions.developerId, session.developerId),
            sql`${agentSessions.startedAt} > ${session.startedAt}`,
          ),
        )
        .orderBy(asc(agentSessions.startedAt))
        .limit(1),
    ]);

  const contextChanges = await db.execute<{
    version: number;
    project_id: string | null;
    work_item_id: string | null;
    label: string | null;
    recorded_at: Date;
  }>(sql`
    SELECT version, project_id, work_item_id, label, recorded_at
    FROM session_context_versions
    WHERE session_id = ${sessionId} AND organization_id = ${organizationId}
    ORDER BY version ASC
  `);

  return {
    session,
    project: projectRows[0]
      ? { id: projectRows[0].id, name: projectRows[0].name }
      : null,
    workItem: workItemRows[0]
      ? { id: workItemRows[0].id, title: workItemRows[0].title }
      : null,
    // received_at vs occurred_at (§11): an event that arrived more than five
    // minutes after it happened is flagged late — e.g. uploaded after an outage.
    events: eventRows.map((r) => ({
      ...(r.payload as ActivityEvent),
      received_at: r.receivedAt.toISOString(),
      late: r.receivedAt.getTime() - r.occurredAt.getTime() > LATE_EVENT_MS,
    })),
    contextChanges: contextChanges.rows.map((r) => ({
      version: r.version,
      projectId: r.project_id,
      workItemId: r.work_item_id,
      label: r.label,
      recordedAt: r.recorded_at,
    })),
    neighbours: {
      previousId: prevRows[0]?.id ?? null,
      nextId: nextRows[0]?.id ?? null,
    },
  };
}
