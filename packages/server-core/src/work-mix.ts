import { sql } from "drizzle-orm";
import { db } from "./db.js";
import { activityTypeOf, IDLE_THRESHOLD_MS, isAgentReported } from "./activity.js";
import type { DateRange } from "./analytics.js";

/**
 * Work mix — how agent time split between verify & ship, writing code, and
 * research & planning, plus idle time inside working periods. ONE set of rules
 * (below) used by both this mix and the Workday graph, so a day can never be
 * "writing code" in one card and "planning" in another.
 *
 * Time is attributed per event interval [t − duration, t], never per session:
 * a single long session that planned, edited, sat idle, and committed shows
 * all four parts, not one label.
 */

export type WorkCategory = "verify" | "writing" | "research";

export interface MixEvent {
  occurred_at: Date | string;
  event_type: string;
  duration_ms: string | number | null;
  metadata: { tool_name?: unknown; telemetry_source?: unknown; tool_category?: unknown } | null;
}

/** Model calls without a reported duration still count as one minute of activity. */
export const MIN_ACTIVE_MS = 60_000;

const TIMED = new Set(["model_request_completed", "tool_completed", "test_completed", "build_completed", "lint_completed", "typecheck_completed"]);

/** The active interval an event represents, or null when it is not timed agent work. */
export function timedInterval(e: MixEvent): { start: number; end: number } | null {
  if (!TIMED.has(e.event_type)) return null;
  const at = new Date(e.occurred_at).getTime();
  let dur = Number(e.duration_ms ?? 0) || 0;
  if (dur <= 0 && e.event_type === "model_request_completed") dur = MIN_ACTIVE_MS;
  return dur > 0 ? { start: at - dur, end: at } : null;
}

/** What the agent was doing in this event's interval. */
export function workCategory(e: MixEvent): WorkCategory {
  const kind = activityTypeOf(e.event_type);
  const cat = String(e.metadata?.tool_category ?? "");
  if (kind === "engineering_check" || cat === "test" || cat === "build") return "verify";
  if (kind === "file_change" || cat === "file_write") return "writing";
  return "research";
}

/** Agent work only: no heartbeats/coverage, no editor-only saves or task runs. */
export function isAgentWork(e: MixEvent): boolean {
  const kind = activityTypeOf(e.event_type);
  if (kind === "connector" || kind === "coverage" || kind === "commit") return false;
  if (e.event_type === "session_heartbeat") return false;
  if (kind === "file_change" || kind === "engineering_check") {
    return isAgentReported({ event_type: e.event_type, metadata: e.metadata });
  }
  return true;
}

interface Interval {
  start: number;
  end: number;
}

export function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = intervals.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else out.push({ ...i });
  }
  return out;
}

const total = (xs: Interval[]) => xs.reduce((s, i) => s + (i.end - i.start), 0);

export interface WorkMix {
  verifyMs: number;
  writingMs: number;
  researchMs: number;
  idleMs: number;
  /** verify + writing + research (merged, parallel work counted once). */
  activeMs: number;
  /** Working periods: agent events chained with gaps under the idle threshold. */
  workingMs: number;
  commits: number;
  shippedCommits: number;
}

/**
 * Mix for ONE person's events (working periods must never chain across
 * people). Precedence when intervals overlap: verify > writing > research.
 */
export function computeWorkMix(events: MixEvent[]): Omit<WorkMix, "commits" | "shippedCommits"> {
  const verify: Interval[] = [];
  const writing: Interval[] = [];
  const all: Interval[] = [];
  const times: number[] = [];
  for (const e of events) {
    if (!isAgentWork(e)) continue;
    const at = new Date(e.occurred_at).getTime();
    times.push(at);
    const interval = timedInterval(e);
    if (!interval) continue;
    times.push(interval.start);
    all.push(interval);
    const category = workCategory(e);
    if (category === "verify") verify.push(interval);
    else if (category === "writing") writing.push(interval);
  }
  const active = mergeIntervals(all);
  const v = mergeIntervals(verify);
  const vw = mergeIntervals([...verify, ...writing]);
  const verifyMs = total(v);
  const writingMs = total(vw) - verifyMs;
  const activeMs = total(active);
  const researchMs = Math.max(0, activeMs - total(vw));

  times.sort((a, b) => a - b);
  const periods: Interval[] = [];
  for (const t of times) {
    const last = periods[periods.length - 1];
    if (last && t - last.end <= IDLE_THRESHOLD_MS) last.end = Math.max(last.end, t);
    else periods.push({ start: t, end: t });
  }
  for (const p of periods) if (p.end - p.start < 60_000) p.end = p.start + 60_000;
  const workingMs = total(mergeIntervals([...periods, ...active]));

  return {
    verifyMs,
    writingMs,
    researchMs,
    idleMs: Math.max(0, workingMs - activeMs),
    activeMs,
    workingMs,
  };
}

/** Work mix for a scope (organisation / team / person / AI tool) and range. */
export async function workMix(input: {
  organizationId: string;
  range: DateRange;
  developerId?: string;
  developerIds?: string[];
  team?: string;
  provider?: string;
}): Promise<WorkMix> {
  const { organizationId, range } = input;
  const devs = input.developerId ? [input.developerId] : input.developerIds;
  const empty: WorkMix = { verifyMs: 0, writingMs: 0, researchMs: 0, idleMs: 0, activeMs: 0, workingMs: 0, commits: 0, shippedCommits: 0 };
  if (devs && devs.length === 0) return empty;
  const people = sql`
    ${devs ? sql`AND e.developer_id IN (${sql.join(devs.map((d) => sql`${d}`), sql`, `)})` : sql``}
    ${input.team ? sql`AND e.developer_id IN (SELECT id FROM employees WHERE organization_id = ${organizationId} AND team = ${input.team})` : sql``}
  `;
  const [events, commits] = await Promise.all([
    db.execute<Record<string, unknown> & MixEvent & { developer_id: string }>(sql`
      SELECT e.developer_id, e.occurred_at, e.event_type, e.payload->>'duration_ms' AS duration_ms,
             e.payload->'metadata' AS metadata
      FROM activity_events e
      WHERE e.organization_id = ${organizationId}
        AND e.occurred_at >= ${range.from} AND e.occurred_at < ${range.to}
        AND e.event_type NOT IN ('heartbeat_sent', 'session_heartbeat', 'commit_created', 'commit_pushed')
        ${input.provider ? sql`AND e.payload->>'provider' = ${input.provider}` : sql``}
        ${people}
      ORDER BY e.developer_id, e.occurred_at
    `),
    input.provider
      ? Promise.resolve({ rows: [{ commits: 0, shipped: 0 }] })
      : db.execute<{ commits: number; shipped: number }>(sql`
          SELECT COUNT(*)::int AS commits,
                 COUNT(*) FILTER (WHERE EXISTS (
                   SELECT 1 FROM activity_events x
                   WHERE x.organization_id = e.organization_id AND x.developer_id = e.developer_id
                     AND x.event_type = 'commit_pushed'
                     AND x.payload->'metadata'->>'commit_ref' = e.payload->'metadata'->>'commit_ref'))::int AS shipped
          FROM activity_events e
          WHERE e.organization_id = ${organizationId}
            AND (e.event_type = 'commit_created'
                 OR (e.event_type = 'build_completed' AND e.payload->'metadata'->>'tool_name' = 'git_commit'))
            AND e.occurred_at >= ${range.from} AND e.occurred_at < ${range.to}
            ${people}
        `),
  ]);
  const byPerson = new Map<string, MixEvent[]>();
  for (const row of events.rows) {
    const list = byPerson.get(row.developer_id) ?? [];
    list.push(row);
    byPerson.set(row.developer_id, list);
  }
  const out = { ...empty };
  for (const list of byPerson.values()) {
    const m = computeWorkMix(list);
    out.verifyMs += m.verifyMs;
    out.writingMs += m.writingMs;
    out.researchMs += m.researchMs;
    out.idleMs += m.idleMs;
    out.activeMs += m.activeMs;
    out.workingMs += m.workingMs;
  }
  out.commits = commits.rows[0]?.commits ?? 0;
  out.shippedCommits = commits.rows[0]?.shipped ?? 0;
  return out;
}

// ---------------------------------------------------------------------------
// Event-time engine: the single source for every time-based chart and KPI.
// ---------------------------------------------------------------------------

export interface TimeSlice {
  activeMs: number;
  idleMs: number;
  workingMs: number;
  verifyMs: number;
  writingMs: number;
  researchMs: number;
}

export interface ActivityTimeline {
  timeZone: string;
  /** YYYY-MM-DD (local) → time that actually happened that day. */
  daily: Map<string, TimeSlice>;
  /** Local hour of day 0–23 → agent active ms. */
  hourOfDay: number[];
  /** Local weekday 0 (Sun) – 6 → agent active ms. */
  weekday: number[];
  totals: TimeSlice;
  /** provider → agent active ms (each tool merged on its own). */
  byProvider: Map<string, number>;
  /** developer → totals. */
  byDeveloper: Map<string, TimeSlice>;
}

const HOUR = 3_600_000;
const zeroSlice = (): TimeSlice => ({ activeMs: 0, idleMs: 0, workingMs: 0, verifyMs: 0, writingMs: 0, researchMs: 0 });

/** Spread merged intervals over hour buckets starting at `origin`. */
function spread(intervals: Interval[], origin: number, hours: number, add: (hourIndex: number, ms: number) => void) {
  for (const i of intervals) {
    let t = Math.max(i.start, origin);
    const end = Math.min(i.end, origin + hours * HOUR);
    while (t < end) {
      const idx = Math.floor((t - origin) / HOUR);
      const bucketEnd = origin + (idx + 1) * HOUR;
      const stop = Math.min(end, bucketEnd);
      add(idx, stop - t);
      t = stop;
    }
  }
}

/** Interval subtraction: parts of `a` not covered by `b` (both merged). */
function subtract(a: Interval[], b: Interval[]): Interval[] {
  const out: Interval[] = [];
  let j = 0;
  for (const x of a) {
    let start = x.start;
    while (j < b.length && b[j].end <= start) j++;
    let k = j;
    while (k < b.length && b[k].start < x.end) {
      if (b[k].start > start) out.push({ start, end: b[k].start });
      start = Math.max(start, b[k].end);
      k++;
    }
    if (start < x.end) out.push({ start, end: x.end });
  }
  return out;
}

export async function activityTimeline(input: {
  organizationId: string;
  range: DateRange;
  timeZone: string;
  developerId?: string;
  developerIds?: string[];
  team?: string;
  provider?: string;
}): Promise<ActivityTimeline> {
  const { organizationId, range, timeZone } = input;
  const devs = input.developerId ? [input.developerId] : input.developerIds;
  const origin = range.from.getTime();
  const hours = Math.max(1, Math.ceil((range.to.getTime() - origin) / HOUR));
  const fmtDay = new Intl.DateTimeFormat("en-CA", { timeZone });
  const fmtHour = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" });
  const fmtDow = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" });
  const DOW: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  // Local calendar labels of every hour bucket (range starts at local midnight).
  const bucketDay: string[] = [];
  const bucketHour: number[] = [];
  const bucketDow: number[] = [];
  for (let i = 0; i < hours; i++) {
    const at = new Date(origin + i * HOUR + 1);
    bucketDay.push(fmtDay.format(at));
    bucketHour.push(Number(fmtHour.format(at)) % 24);
    bucketDow.push(DOW[fmtDow.format(at)] ?? 0);
  }

  const out: ActivityTimeline = {
    timeZone,
    daily: new Map(),
    hourOfDay: Array(24).fill(0),
    weekday: Array(7).fill(0),
    totals: zeroSlice(),
    byProvider: new Map(),
    byDeveloper: new Map(),
  };
  if (devs && devs.length === 0) return out;

  const res = await db.execute<Record<string, unknown> & MixEvent & { developer_id: string; provider: string | null }>(sql`
    SELECT e.developer_id, e.occurred_at, e.event_type, e.payload->>'duration_ms' AS duration_ms,
           e.payload->'metadata' AS metadata, e.payload->>'provider' AS provider
    FROM activity_events e
    WHERE e.organization_id = ${organizationId}
      -- Include calls that started in range but finished within a day after it.
      AND e.occurred_at >= ${range.from} AND e.occurred_at < ${new Date(range.to.getTime() + 86_400_000)}
      AND e.event_type NOT IN ('heartbeat_sent', 'session_heartbeat', 'commit_created', 'commit_pushed')
      ${input.provider ? sql`AND e.payload->>'provider' = ${input.provider}` : sql``}
      ${devs ? sql`AND e.developer_id IN (${sql.join(devs.map((d) => sql`${d}`), sql`, `)})` : sql``}
      ${input.team ? sql`AND e.developer_id IN (SELECT id FROM employees WHERE organization_id = ${organizationId} AND team = ${input.team})` : sql``}
    ORDER BY e.developer_id, e.occurred_at
  `);

  const byPerson = new Map<string, (MixEvent & { provider: string | null })[]>();
  for (const row of res.rows) {
    const list = byPerson.get(row.developer_id) ?? [];
    list.push(row);
    byPerson.set(row.developer_id, list);
  }

  const dayOf = (day: string) => {
    let slice = out.daily.get(day);
    if (!slice) out.daily.set(day, (slice = zeroSlice()));
    return slice;
  };

  for (const [developerId, events] of byPerson) {
    const verify: Interval[] = [];
    const writing: Interval[] = [];
    const all: Interval[] = [];
    const times: number[] = [];
    const perProvider = new Map<string, Interval[]>();
    for (const e of events) {
      if (!isAgentWork(e)) continue;
      times.push(new Date(e.occurred_at).getTime());
      const interval = timedInterval(e);
      if (!interval) continue;
      times.push(interval.start);
      all.push(interval);
      const category = workCategory(e);
      if (category === "verify") verify.push(interval);
      else if (category === "writing") writing.push(interval);
      if (e.provider) {
        const list = perProvider.get(e.provider) ?? [];
        list.push(interval);
        perProvider.set(e.provider, list);
      }
    }
    const active = mergeIntervals(all);
    const v = mergeIntervals(verify);
    const w = subtract(mergeIntervals(writing), v);
    const r = subtract(active, mergeIntervals([...verify, ...writing]));
    times.sort((a, b) => a - b);
    const periods: Interval[] = [];
    for (const t of times) {
      const last = periods[periods.length - 1];
      if (last && t - last.end <= IDLE_THRESHOLD_MS) last.end = Math.max(last.end, t);
      else periods.push({ start: t, end: t });
    }
    for (const p of periods) if (p.end - p.start < 60_000) p.end = p.start + 60_000;
    const working = mergeIntervals([...periods, ...active]);
    const idle = subtract(working, active);

    const person = zeroSlice();
    const put = (list: Interval[], key: keyof TimeSlice) =>
      spread(list, origin, hours, (idx, ms) => {
        dayOf(bucketDay[idx])[key] += ms;
        out.totals[key] += ms;
        person[key] += ms;
        if (key === "activeMs") {
          out.hourOfDay[bucketHour[idx]] += ms;
          out.weekday[bucketDow[idx]] += ms;
        }
      });
    put(active, "activeMs");
    put(idle, "idleMs");
    put(working, "workingMs");
    put(v, "verifyMs");
    put(w, "writingMs");
    put(r, "researchMs");
    out.byDeveloper.set(developerId, person);
    for (const [provider, list] of perProvider) {
      let ms = 0;
      spread(mergeIntervals(list), origin, hours, (_idx, x) => (ms += x));
      out.byProvider.set(provider, (out.byProvider.get(provider) ?? 0) + ms);
    }
  }
  return out;
}
