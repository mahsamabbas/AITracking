import { sql } from "drizzle-orm";
import { db } from "../db.js";

/**
 * Read side of activity_hourly: per person, per UTC hour, the event-time
 * engine's output (the same numbers every chart is built from). Hours before
 * an organisation's `summarized_before` come from here; later hours are
 * computed from raw events. Never both, so nothing is counted twice.
 */

/** Slot order of a stored slice (also the per-provider array layout). */
export const SLICE_KEYS = [
  "activeMs",
  "idleMs",
  "workingMs",
  "verifyMs",
  "writingMs",
  "researchMs",
  "modelRequests",
  "toolCalls",
  "fileChanges",
] as const;
export type SliceKey = (typeof SLICE_KEYS)[number];
export type HourSlice = Record<SliceKey, number>;

export const zeroHourSlice = (): HourSlice =>
  Object.fromEntries(SLICE_KEYS.map((k) => [k, 0])) as HourSlice;

export function sliceToArray(s: HourSlice): number[] {
  return SLICE_KEYS.map((k) => Math.round(s[k]));
}

export function arrayToSlice(a: unknown): HourSlice {
  const arr = Array.isArray(a) ? a : [];
  return Object.fromEntries(SLICE_KEYS.map((k, i) => [k, Number(arr[i] ?? 0) || 0])) as HourSlice;
}

/** Hours before this instant are served from summaries (null: none yet). */
export async function summarizedBefore(organizationId: string): Promise<Date | null> {
  try {
    const res = await db.execute<{ before: Date | string | null }>(sql`
      SELECT summarized_before AS before FROM retention_state WHERE organization_id = ${organizationId}
    `);
    const v = res.rows[0]?.before;
    return v ? new Date(v) : null;
  } catch {
    // Table missing (migration not applied yet): everything is raw.
    return null;
  }
}

export interface HourlyRow {
  developerId: string;
  hourStart: Date;
  slice: HourSlice;
  byProvider: Map<string, HourSlice>;
  /** Workspace → agent file changes (all tools). */
  workspaces: Record<string, number>;
}

/**
 * Summary rows in [from, to), scoped like the charts. With `provider`, each
 * row's slice is that tool's own (computed from its events alone), exactly
 * as a provider-filtered raw computation would produce.
 */
export async function readHourly(input: {
  organizationId: string;
  from: Date;
  to: Date;
  developerIds?: string[];
  team?: string;
  provider?: string;
}): Promise<HourlyRow[]> {
  if (input.to <= input.from) return [];
  if (input.developerIds && input.developerIds.length === 0) return [];
  const { organizationId } = input;
  const res = await db.execute<{
    developer_id: string;
    hour_start: Date | string;
    active_ms: number;
    idle_ms: number;
    working_ms: number;
    verify_ms: number;
    writing_ms: number;
    research_ms: number;
    model_requests: number;
    tool_calls: number;
    file_changes: number;
    by_provider: Record<string, unknown> | null;
    workspaces: Record<string, number> | null;
  }>(sql`
    SELECT h.developer_id, h.hour_start, h.active_ms, h.idle_ms, h.working_ms, h.verify_ms,
           h.writing_ms, h.research_ms, h.model_requests, h.tool_calls, h.file_changes, h.by_provider, h.workspaces
    FROM activity_hourly h
    WHERE h.organization_id = ${organizationId}
      AND h.hour_start >= ${input.from} AND h.hour_start < ${input.to}
      ${input.developerIds ? sql`AND h.developer_id IN (${sql.join(input.developerIds.map((d) => sql`${d}`), sql`, `)})` : sql``}
      ${input.team ? sql`AND h.developer_id IN (SELECT id FROM employees WHERE organization_id = ${organizationId} AND team = ${input.team})` : sql``}
      ${input.provider ? sql`AND h.by_provider ? ${input.provider}` : sql``}
  `);
  return res.rows.map((r) => {
    const byProvider = new Map<string, HourSlice>();
    for (const [p, arr] of Object.entries(r.by_provider ?? {})) byProvider.set(p, arrayToSlice(arr));
    const all: HourSlice = {
      activeMs: Number(r.active_ms),
      idleMs: Number(r.idle_ms),
      workingMs: Number(r.working_ms),
      verifyMs: Number(r.verify_ms),
      writingMs: Number(r.writing_ms),
      researchMs: Number(r.research_ms),
      modelRequests: Number(r.model_requests),
      toolCalls: Number(r.tool_calls),
      fileChanges: Number(r.file_changes),
    };
    return {
      developerId: r.developer_id,
      hourStart: new Date(r.hour_start),
      slice: input.provider ? (byProvider.get(input.provider) ?? zeroHourSlice()) : all,
      byProvider,
      workspaces: r.workspaces ?? {},
    };
  });
}

/** Summary rows added up per local calendar day (YYYY-MM-DD in `timeZone`). */
export function sumByLocalDay(rows: HourlyRow[], timeZone: string): Map<string, HourSlice> {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone });
  const out = new Map<string, HourSlice>();
  for (const row of rows) {
    // +1 ms: an hour starting at local midnight belongs to that day.
    const key = fmt.format(new Date(row.hourStart.getTime() + 1));
    const acc = out.get(key) ?? zeroHourSlice();
    for (const k of SLICE_KEYS) acc[k] += row.slice[k];
    out.set(key, acc);
  }
  return out;
}

/** Where a range splits: [from, rawFrom) from summaries, [rawFrom, to) from raw events. */
export async function splitRange(organizationId: string, from: Date, to: Date): Promise<Date> {
  const boundary = await summarizedBefore(organizationId);
  if (!boundary || boundary <= from) return from;
  return boundary < to ? boundary : to;
}
