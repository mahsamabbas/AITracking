import { sql } from "drizzle-orm";
import { db } from "./db.js";
import { activityTypeOf, IDLE_THRESHOLD_MS, isAgentReported } from "./activity.js";
import { resolveReportingTimezone } from "./timezone.js";

/**
 * One person's day, hour by hour, from agent events only (heartbeats and
 * connector events never count as work):
 *
 *   working span — time between agent events with no gap longer than
 *                  IDLE_THRESHOLD_MS (the person was working with an agent)
 *   AI active    — union of model and tool intervals [t − duration, t]
 *   idle         — working span minus AI active (reviewing, typing, waiting)
 *   exploration  — agent active time not spent on writes, checks, or verify/build tools
 *                  (model time, reads, search, shell, planning)
 *   editing      — agent active time on file writes, tests, builds, lint, or typecheck
 *
 * Coverage gaps (collection paused, connector offline) are listed separately
 * and are never counted as idle or as "left".
 */

interface Interval {
  start: number;
  end: number;
}

export interface WorkdayHour {
  hour: number;
  workingMs: number;
  activeMs: number;
  idleMs: number;
  explorationMs: number;
  editingMs: number;
  fileChanges: number;
  modelRequests: number;
  toolCalls: number;
}

export interface Workday {
  date: string;
  timezone: string;
  firstActivityAt: string | null;
  lastActivityAt: string | null;
  /** Periods of continuous agent work; breaks are the gaps between them. */
  periods: { start: string; end: string; ms: number }[];
  breaks: { start: string; end: string; ms: number }[];
  coverageGaps: { start: string; end: string | null; reason: string }[];
  hours: WorkdayHour[];
  totals: {
    workingMs: number;
    activeMs: number;
    idleMs: number;
    explorationMs: number;
    editingMs: number;
    fileChanges: number;
    filesTouched: number;
    modelRequests: number;
    toolCalls: number;
    sessions: number;
  };
  providers: string[];
}

function merge(intervals: Interval[]): Interval[] {
  const sorted = intervals.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else out.push({ ...i });
  }
  return out;
}

function clip(intervals: Interval[], from: number, to: number): number {
  let total = 0;
  for (const i of intervals) total += Math.max(0, Math.min(i.end, to) - Math.max(i.start, from));
  return total;
}

const EDITING_TOOL_CATEGORIES = new Set(["file_write", "test", "build"]);

function isEditingActivity(event: {
  event_type: string;
  metadata: { tool_name?: unknown; telemetry_source?: unknown; tool_category?: unknown } | null;
}): boolean {
  const kind = activityTypeOf(event.event_type);
  if (kind === "file_change" || kind === "engineering_check") {
    return isAgentReported({ event_type: event.event_type, metadata: event.metadata });
  }
  if (event.event_type === "tool_completed") {
    const cat = String(event.metadata?.tool_category ?? "");
    if (EDITING_TOOL_CATEGORIES.has(cat)) return true;
  }
  return false;
}

/** Minimum active slice when the provider reports completion without duration_ms. */
const MIN_ACTIVE_MS = 60_000;

export async function workday(input: {
  organizationId: string;
  developerId: string;
  date: string; // YYYY-MM-DD in the org timezone
  timeZone?: string;
}): Promise<Workday> {
  const { organizationId, developerId, date } = input;
  const tz = await resolveReportingTimezone(organizationId, input.timeZone);

  const bounds = await db.execute<{ start: Date; end: Date }>(sql`
    SELECT (${date}::date::timestamp AT TIME ZONE ${tz})                        AS start,
           ((${date}::date + 1)::timestamp AT TIME ZONE ${tz})                  AS end
  `);
  const dayStart = new Date(bounds.rows[0].start).getTime();
  const dayEnd = new Date(bounds.rows[0].end).getTime();

  const [eventRes, gapRes] = await Promise.all([
    db.execute<{
      occurred_at: Date;
      event_type: string;
      duration_ms: string | null;
      session_id: string | null;
      provider: string | null;
      status: string | null;
      file_path: string | null;
      metadata: { tool_name?: unknown; telemetry_source?: unknown; tool_category?: unknown } | null;
    }>(sql`
      SELECT e.occurred_at, e.event_type, e.payload->>'duration_ms' AS duration_ms,
             e.session_id, e.payload->>'provider' AS provider, e.payload->>'status' AS status,
             e.payload->'metadata'->>'file_path' AS file_path,
             e.payload->'metadata' AS metadata
      FROM activity_events e
      WHERE e.organization_id = ${organizationId}
        AND e.developer_id = ${developerId}
        AND e.occurred_at >= ${new Date(dayStart)} AND e.occurred_at < ${new Date(dayEnd)}
        -- Liveness pulses (connector heartbeat, IDE keep-alive) are not work.
        AND e.event_type NOT IN ('heartbeat_sent', 'session_heartbeat')
      ORDER BY e.occurred_at
    `),
    // Gaps that overlap the day, including one that started before it.
    db.execute<{ started: Date; ended: Date | null; reason: string | null }>(sql`
      SELECT g.occurred_at AS started,
             (SELECT MIN(x.occurred_at) FROM activity_events x
               WHERE x.organization_id = ${organizationId}
                 AND x.device_id = g.device_id
                 AND x.event_type IN ('telemetry_gap_ended', 'connector_resumed')
                 AND x.occurred_at >= g.occurred_at) AS ended,
             COALESCE(g.payload->'metadata'->>'gap_reason',
                      CASE WHEN g.event_type = 'connector_paused' THEN 'paused' END) AS reason
      FROM activity_events g
      WHERE g.organization_id = ${organizationId}
        AND g.developer_id = ${developerId}
        AND g.event_type IN ('telemetry_gap_started', 'connector_paused')
        AND g.occurred_at < ${new Date(dayEnd)}
        AND g.occurred_at >= ${new Date(dayStart - 7 * 86_400_000)}
    `),
  ]);

  const agentTimes: number[] = [];
  const all: Interval[] = [];
  const editing: Interval[] = [];
  const files: { at: number; path: string | null }[] = [];
  const models: number[] = [];
  const tools: number[] = [];
  const sessions = new Set<string>();
  const providers = new Set<string>();

  for (const e of eventRes.rows) {
    const kind = activityTypeOf(e.event_type);
    if (kind === "connector" || kind === "coverage") continue;
    // A person's own saves / task runs (IDE companion) are not AI work.
    if ((kind === "file_change" || kind === "engineering_check") && !isAgentReported({ event_type: e.event_type, metadata: e.metadata })) continue;
    const at = new Date(e.occurred_at).getTime();
    const duration = Number(e.duration_ms ?? 0) || 0;
    agentTimes.push(at);
    if (e.session_id) sessions.add(e.session_id);
    if (e.provider) providers.add(e.provider);

    const timed =
      e.event_type === "model_request_completed" ||
      e.event_type === "tool_completed" ||
      e.event_type === "test_completed" ||
      e.event_type === "build_completed";
    if (timed) {
      let dur = duration;
      if (dur <= 0 && e.event_type === "model_request_completed") dur = MIN_ACTIVE_MS;
      if (dur > 0) {
        agentTimes.push(at - dur);
        const interval = { start: at - dur, end: at };
        all.push(interval);
        if (isEditingActivity(e)) editing.push(interval);
      }
    }
    if (e.event_type === "model_request_completed") models.push(at);
    if (e.event_type === "tool_completed") tools.push(at);
    if (kind === "file_change") files.push({ at, path: e.file_path });
  }

  agentTimes.sort((a, b) => a - b);
  const active = merge(all);
  const activeEditing = merge(editing);

  // Working periods: agent events chained while gaps stay under the idle threshold.
  const periods: Interval[] = [];
  for (const t of agentTimes) {
    const last = periods[periods.length - 1];
    if (last && t - last.end <= IDLE_THRESHOLD_MS) last.end = Math.max(last.end, t);
    else periods.push({ start: t, end: t });
  }
  // A lone event still represents a minute of work.
  for (const p of periods) if (p.end - p.start < 60_000) p.end = p.start + 60_000;
  const working = merge([...periods, ...active]);

  const hours: WorkdayHour[] = [];
  for (let h = 0; h < 24; h++) {
    const from = dayStart + h * 3_600_000;
    const to = Math.min(from + 3_600_000, dayEnd);
    const workingMs = clip(working, from, to);
    const activeMs = clip(active, from, to);
    const editingMs = clip(activeEditing, from, to);
    hours.push({
      hour: h,
      workingMs,
      activeMs,
      idleMs: Math.max(0, workingMs - activeMs),
      editingMs,
      // Research & planning = agent active time not attributed to writes, checks, or verify tools.
      explorationMs: Math.max(0, activeMs - editingMs),
      fileChanges: files.filter((f) => f.at >= from && f.at < to).length,
      modelRequests: models.filter((t) => t >= from && t < to).length,
      toolCalls: tools.filter((t) => t >= from && t < to).length,
    });
  }

  const sum = (key: keyof WorkdayHour) => hours.reduce((s, h) => s + (h[key] as number), 0);
  const iso = (ms: number) => new Date(ms).toISOString();
  const breaks: Workday["breaks"] = [];
  for (let i = 1; i < working.length; i++) {
    breaks.push({ start: iso(working[i - 1].end), end: iso(working[i].start), ms: working[i].start - working[i - 1].end });
  }

  return {
    date,
    timezone: tz,
    firstActivityAt: working.length ? iso(working[0].start) : null,
    lastActivityAt: working.length ? iso(working[working.length - 1].end) : null,
    periods: working.map((p) => ({ start: iso(p.start), end: iso(p.end), ms: p.end - p.start })),
    breaks,
    coverageGaps: gapRes.rows
      .filter((g) => !g.ended || new Date(g.ended).getTime() > dayStart)
      .map((g) => ({
        start: iso(Math.max(new Date(g.started).getTime(), dayStart)),
        end: g.ended ? iso(Math.min(new Date(g.ended).getTime(), dayEnd)) : null,
        reason: g.reason ?? "gap",
      })),
    hours,
    totals: {
      workingMs: sum("workingMs"),
      activeMs: sum("activeMs"),
      idleMs: sum("idleMs"),
      explorationMs: sum("explorationMs"),
      editingMs: sum("editingMs"),
      fileChanges: files.length,
      filesTouched: new Set(files.map((f) => f.path).filter(Boolean)).size,
      modelRequests: models.length,
      toolCalls: tools.length,
      sessions: sessions.size,
    },
    providers: [...providers],
  };
}
