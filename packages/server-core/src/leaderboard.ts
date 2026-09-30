import { activityTimeline } from "./work-mix.js";
import { resolveReportingTimezone } from "./timezone.js";
import { sql } from "drizzle-orm";
import { db } from "./db.js";
import type { DateRange } from "./analytics.js";
import { toNumber, toNumberOrNull } from "./sql-helpers.js";

/**
 * AI usage leaderboard — one row per employee, ranked by a chosen AI-usage
 * metric. Administrators and managers only (enforced in the API).
 *
 * Every figure comes from agent_sessions (Tier A) or provider daily aggregates
 * (Tier B). A metric no session reported stays null ("Not reported"), and a
 * null never ranks above a real value.
 */

export type LeaderboardSort =
  | "active"
  | "sessions"
  | "modelRequests"
  | "toolCalls"
  | "fileChanges"
  | "tokens"
  | "providerRequests";

export const LEADERBOARD_SORTS: LeaderboardSort[] = [
  "active",
  "sessions",
  "modelRequests",
  "toolCalls",
  "fileChanges",
  "tokens",
  "providerRequests",
];

export interface LeaderboardRow {
  /** 1-based; ties share a rank. null = nothing measured for the sort metric. */
  rank: number | null;
  id: string;
  displayName: string;
  team: string | null;
  title: string | null;
  activeMs: number;
  sessions: number;
  modelRequests: number;
  toolCalls: number;
  fileChanges: number;
  testsRun: number;
  buildsRun: number;
  /** null = no session in range reported tokens (not zero). */
  tokenInput: number | null;
  tokenOutput: number | null;
  /** Tier B provider-reported requests (Cursor billable, Copilot chat turns); null when none reported. */
  providerRequests: number | null;
  providers: string[];
  lastActiveAt: string | null;
}

const num = toNumber;
const numOrNull = toNumberOrNull;

function metric(row: LeaderboardRow, sort: LeaderboardSort): number | null {
  switch (sort) {
    case "active":
      return row.sessions > 0 ? row.activeMs : null;
    case "sessions":
      return row.sessions > 0 ? row.sessions : null;
    case "modelRequests":
      return row.sessions > 0 ? row.modelRequests : null;
    case "toolCalls":
      return row.sessions > 0 ? row.toolCalls : null;
    case "fileChanges":
      return row.sessions > 0 ? row.fileChanges : null;
    case "tokens":
      return row.tokenInput == null && row.tokenOutput == null
        ? null
        : (row.tokenInput ?? 0) + (row.tokenOutput ?? 0);
    case "providerRequests":
      return row.providerRequests;
  }
}

export async function aiUsageLeaderboard(input: {
  organizationId: string;
  range: DateRange;
  team?: string;
  provider?: string;
  sort?: LeaderboardSort;
}): Promise<LeaderboardRow[]> {
  const { organizationId, range } = input;
  const sort = input.sort ?? "active";
  const provider = input.provider ?? null;
  const team = input.team ?? null;

  const res = await db.execute<Record<string, unknown>>(sql`
    WITH s AS (
      SELECT developer_id,
             COUNT(*)::int                AS sessions,
             SUM(active_duration_ms)      AS active_ms,
             SUM(model_requests)          AS model_requests,
             SUM(tool_calls)              AS tool_calls,
             SUM(file_changes)            AS file_changes,
             SUM(tests_run)               AS tests_run,
             SUM(builds_run)              AS builds_run,
             SUM(token_input)             AS token_input,
             SUM(token_output)            AS token_output,
             array_agg(DISTINCT provider) AS providers,
             MAX(COALESCE(last_event_at, started_at)) AS last_at
      FROM agent_sessions
      WHERE organization_id = ${organizationId}
        AND started_at >= ${range.from} AND started_at < ${range.to}
        AND (${provider}::text IS NULL OR provider = ${provider})
      GROUP BY developer_id
    ),
    b AS (
      -- Tier B daily reports. SUM of no values stays NULL, never 0.
      SELECT e.developer_id,
             SUM(COALESCE((e.payload->'metadata'->>'billable_requests_count')::bigint,
                          (e.payload->'metadata'->>'chat_requests_count')::bigint)) AS provider_requests,
             array_agg(DISTINCT e.payload->>'provider') AS providers,
             MAX(e.occurred_at) AS last_at
      FROM activity_events e
      WHERE e.organization_id = ${organizationId}
        AND e.event_type = 'provider_daily_aggregate'
        AND e.occurred_at >= ${range.from} AND e.occurred_at < ${range.to}
        AND (${provider}::text IS NULL OR e.payload->>'provider' = ${provider})
      GROUP BY e.developer_id
    )
    SELECT emp.id, emp.display_name, emp.team, emp.title,
           s.sessions, s.active_ms, s.model_requests, s.tool_calls, s.file_changes,
           s.tests_run, s.builds_run, s.token_input, s.token_output,
           b.provider_requests,
           COALESCE(s.providers, '{}') || COALESCE(b.providers, '{}') AS providers,
           GREATEST(s.last_at, b.last_at) AS last_at
    FROM employees emp
    LEFT JOIN s ON s.developer_id = emp.id
    LEFT JOIN b ON b.developer_id = emp.id
    WHERE emp.organization_id = ${organizationId}
      AND emp.status <> 'inactive'
      AND (${team}::text IS NULL OR emp.team = ${team})
  `);

  const rows: LeaderboardRow[] = res.rows.map((r) => ({
    rank: null,
    id: String(r.id),
    displayName: String(r.display_name),
    team: (r.team as string | null) ?? null,
    title: (r.title as string | null) ?? null,
    activeMs: num(r.active_ms),
    sessions: num(r.sessions),
    modelRequests: num(r.model_requests),
    toolCalls: num(r.tool_calls),
    fileChanges: num(r.file_changes),
    testsRun: num(r.tests_run),
    buildsRun: num(r.builds_run),
    tokenInput: numOrNull(r.token_input),
    tokenOutput: numOrNull(r.token_output),
    providerRequests: numOrNull(r.provider_requests),
    providers: [...new Set(((r.providers as (string | null)[] | null) ?? []).filter(Boolean) as string[])],
    lastActiveAt: r.last_at ? new Date(r.last_at as string).toISOString() : null,
  }));

  // AI active time = event time (same source as every other chart).
  const tz = await resolveReportingTimezone(organizationId);
  const timeline = await activityTimeline({ organizationId, range, timeZone: tz, team: input.team, provider: input.provider });
  for (const row of rows) row.activeMs = timeline.byDeveloper.get(row.id)?.activeMs ?? 0;

  // Measured values first (descending), then people with nothing measured, by name.
  rows.sort((a, b) => {
    const ma = metric(a, sort);
    const mb = metric(b, sort);
    if (ma == null && mb == null) return a.displayName.localeCompare(b.displayName);
    if (ma == null) return 1;
    if (mb == null) return -1;
    return mb - ma || a.displayName.localeCompare(b.displayName);
  });
  let previous: number | null = null;
  let rank = 0;
  rows.forEach((row, i) => {
    const m = metric(row, sort);
    if (m == null) return;
    if (m !== previous) rank = i + 1;
    previous = m;
    row.rank = rank;
  });
  return rows;
}
