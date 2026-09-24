import { sql } from "drizzle-orm";
import { db } from "./db.js";
import { AGENT_REPORTED_SQL, PRODUCTIVE_CLASSIFICATIONS } from "./activity.js";
import {
  connectorStateOf,
  rollupConnectorState,
} from "./connector-state.js";
import { resolveOrgTimezone, resolveReportingTimezone, timezoneFromEnv } from "./timezone.js";

export interface DateRange {
  from: Date;
  to: Date;
}

/** Env fallback only — prefer {@link scopeTimezone} when you have an organisation id. */
export function orgTimezone(): string {
  return timezoneFromEnv();
}

async function scopeTimezone(f: ScopeFilters): Promise<string> {
  if (f.timeZone?.trim()) {
    try {
      new Intl.DateTimeFormat("en", { timeZone: f.timeZone.trim() });
      return f.timeZone.trim();
    } catch {
      /* invalid override */
    }
  }
  return resolveOrgTimezone(f.organizationId);
}

/** Same-length window immediately before `range`, for period-over-period deltas. */
export function previousRange(range: DateRange): DateRange {
  const span = range.to.getTime() - range.from.getTime();
  return {
    from: new Date(range.from.getTime() - span),
    to: new Date(range.from.getTime()),
  };
}

const PRODUCTIVE = PRODUCTIVE_CLASSIFICATIONS;

// ---------------------------------------------------------------------------
// Employee directory
// ---------------------------------------------------------------------------

export interface EmployeeDirectoryRow {
  id: string;
  displayName: string;
  email: string | null;
  team: string | null;
  title: string | null;
  status: string;
  connectorState: "online" | "stale" | "paused" | "offline";
  lastHeartbeat: string | null;
  lastActiveAt: string | null;
  activeMs: number;
  productiveMs: number;
  idleMs: number;
  elapsedMs: number;
  sessions: number;
  modelRequests: number;
  fileChanges: number;
  avgSessionMs: number;
  tools: { provider: string; activeMs: number; sessions: number }[];
  trend: { date: string; activeMs: number }[];
  coverageWarning: boolean;
  /** Events whose occurred_at falls in the current UTC hour. */
  currentHourEvents: number;
}

export interface EmployeeDirectoryFilters {
  organizationId: string;
  range: DateRange;
  search?: string;
  team?: string;
  provider?: string;
  status?: string;
  connectorState?: string;
  developerIds?: string[];
  sort?: "name" | "activity" | "sessions" | "recent";
  timeZone?: string;
}

export async function listEmployeeDirectory(
  f: EmployeeDirectoryFilters,
): Promise<EmployeeDirectoryRow[]> {
  const tz = await resolveReportingTimezone(f.organizationId, f.timeZone);

  const base = await db.execute<{
    id: string;
    display_name: string;
    email: string | null;
    team: string | null;
    title: string | null;
    status: string;
    paused: number | null;
    last_heartbeat: Date | null;
    any_offline: boolean | null;
    any_stale: boolean | null;
    any_online: boolean | null;
    active_ms: string | null;
    productive_ms: string | null;
    idle_ms: string | null;
    elapsed_ms: string | null;
    sessions: number | null;
    model_requests: string | null;
    file_changes: string | null;
    last_active_at: Date | null;
  }>(sql`
    WITH agg AS (
      SELECT s.developer_id,
             SUM(s.active_duration_ms)                                        AS active_ms,
             SUM(CASE WHEN s.classification = ANY(${sql.raw(`ARRAY['${PRODUCTIVE.join("','")}']`)})
                      THEN s.active_duration_ms ELSE 0 END)                    AS productive_ms,
             SUM(s.idle_duration_ms)                                          AS idle_ms,
             SUM(s.elapsed_span_ms)                                           AS elapsed_ms,
             COUNT(*)::int                                                     AS sessions,
             SUM(s.model_requests)                                            AS model_requests,
             SUM(s.file_changes)                                              AS file_changes,
             MAX(COALESCE(s.last_event_at, s.started_at))                      AS last_active_at
      FROM agent_sessions s
      WHERE s.organization_id = ${f.organizationId}
        AND s.started_at >= ${f.range.from} AND s.started_at < ${f.range.to}
      GROUP BY s.developer_id
    ),
    health AS (
      -- Person-level badge is the worst state across live connector rows.
      SELECT d.developer_id,
             MAX(ch.paused)                                         AS paused,
             MAX(ch.last_heartbeat)                                 AS last_heartbeat,
             bool_or(
               ch.last_heartbeat IS NULL
             )                                                      AS any_offline,
             bool_or(
               ch.last_heartbeat < NOW() - INTERVAL '5 minutes'
             )                                                      AS any_stale,
             bool_or(
               ch.paused IS DISTINCT FROM 1
               AND ch.last_heartbeat IS NOT NULL
               AND ch.last_heartbeat >= NOW() - INTERVAL '5 minutes'
             )                                                      AS any_online
      FROM devices d
      LEFT JOIN connector_health ch ON ch.device_id = d.id
      WHERE d.organization_id = ${f.organizationId} AND d.revoked_at IS NULL AND d.kind = 'connector'
      GROUP BY d.developer_id
    )
    SELECT e.id, e.display_name, e.email, e.team, e.title, e.status,
           h.paused, h.last_heartbeat, h.any_offline, h.any_stale, h.any_online,
           a.active_ms, a.productive_ms, a.idle_ms, a.elapsed_ms,
           a.sessions, a.model_requests, a.file_changes, a.last_active_at
    FROM employees e
    LEFT JOIN agg a    ON a.developer_id = e.id
    LEFT JOIN health h ON h.developer_id = e.id
    WHERE e.organization_id = ${f.organizationId}
    ORDER BY e.display_name ASC
  `);

  const [tools, trends, hourCounts] = await Promise.all([
    db.execute<{
      developer_id: string;
      provider: string;
      active_ms: string;
      sessions: number;
    }>(sql`
      SELECT developer_id, provider,
             SUM(active_duration_ms) AS active_ms,
             COUNT(*)::int           AS sessions
      FROM agent_sessions
      WHERE organization_id = ${f.organizationId}
        AND started_at >= ${f.range.from} AND started_at < ${f.range.to}
      GROUP BY developer_id, provider
      ORDER BY active_ms DESC
    `),
    db.execute<{ developer_id: string; day: string; active_ms: string }>(sql`
      SELECT developer_id,
             to_char((started_at AT TIME ZONE ${tz})::date, 'YYYY-MM-DD') AS day,
             SUM(active_duration_ms) AS active_ms
      FROM agent_sessions
      WHERE organization_id = ${f.organizationId}
        AND started_at >= ${f.range.from} AND started_at < ${f.range.to}
      GROUP BY developer_id, day
      ORDER BY day ASC
    `),
    db.execute<{ developer_id: string; n: number }>(sql`
      SELECT developer_id, COUNT(*)::int AS n
      FROM activity_events
      WHERE organization_id = ${f.organizationId}
        AND occurred_at >= date_trunc('hour', NOW())
      GROUP BY developer_id
    `),
  ]);

  const toolsBy = new Map<string, { provider: string; activeMs: number; sessions: number }[]>();
  for (const t of tools.rows) {
    const list = toolsBy.get(t.developer_id) ?? [];
    list.push({
      provider: t.provider,
      activeMs: Number(t.active_ms ?? 0),
      sessions: t.sessions,
    });
    toolsBy.set(t.developer_id, list);
  }

  const hourBy = new Map<string, number>();
  for (const h of hourCounts.rows) hourBy.set(h.developer_id, h.n);

  const trendBy = new Map<string, { date: string; activeMs: number }[]>();
  for (const t of trends.rows) {
    const list = trendBy.get(t.developer_id) ?? [];
    list.push({ date: t.day, activeMs: Number(t.active_ms ?? 0) });
    trendBy.set(t.developer_id, list);
  }

  let rows: EmployeeDirectoryRow[] = base.rows.map((r) => {
    const sessions = r.sessions ?? 0;
    const activeMs = Number(r.active_ms ?? 0);
    const connectorState = rollupConnectorState({
      paused: r.paused,
      lastHeartbeat: r.last_heartbeat,
      anyOffline: r.any_offline,
      anyStale: r.any_stale,
      anyOnline: r.any_online,
      hasDevices: r.any_offline !== null,
    });
    return {
      id: r.id,
      displayName: r.display_name,
      email: r.email,
      team: r.team,
      title: r.title,
      status: r.status,
      connectorState,
      lastHeartbeat: r.last_heartbeat ? new Date(r.last_heartbeat).toISOString() : null,
      lastActiveAt: r.last_active_at ? new Date(r.last_active_at).toISOString() : null,
      activeMs,
      productiveMs: Number(r.productive_ms ?? 0),
      idleMs: Number(r.idle_ms ?? 0),
      elapsedMs: Number(r.elapsed_ms ?? 0),
      sessions,
      modelRequests: Number(r.model_requests ?? 0),
      fileChanges: Number(r.file_changes ?? 0),
      avgSessionMs: sessions > 0 ? Math.round(activeMs / sessions) : 0,
      tools: toolsBy.get(r.id) ?? [],
      trend: trendBy.get(r.id) ?? [],
      coverageWarning:
        connectorState !== "online" ||
        Boolean(r.any_offline) ||
        Boolean(r.any_stale) ||
        r.paused === 1,
      currentHourEvents: hourBy.get(r.id) ?? 0,
    };
  });

  if (f.developerIds) {
    const allow = new Set(f.developerIds);
    rows = rows.filter((r) => allow.has(r.id));
  }
  if (f.search) {
    const q = f.search.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.displayName.toLowerCase().includes(q) ||
        (r.email ?? "").toLowerCase().includes(q) ||
        (r.team ?? "").toLowerCase().includes(q) ||
        (r.title ?? "").toLowerCase().includes(q),
    );
  }
  if (f.team) rows = rows.filter((r) => r.team === f.team);
  if (f.status) rows = rows.filter((r) => r.status === f.status);
  if (f.connectorState) {
    rows = rows.filter((r) => r.connectorState === f.connectorState);
  }
  if (f.provider) {
    rows = rows.filter((r) => r.tools.some((t) => t.provider === f.provider));
  }

  const sort = f.sort ?? "activity";
  rows.sort((a, b) => {
    if (sort === "name") return a.displayName.localeCompare(b.displayName);
    if (sort === "sessions") return b.sessions - a.sessions;
    if (sort === "recent") {
      return (
        new Date(b.lastActiveAt ?? 0).getTime() -
        new Date(a.lastActiveAt ?? 0).getTime()
      );
    }
    return b.activeMs - a.activeMs;
  });

  return rows;
}

export async function listTeams(organizationId: string): Promise<string[]> {
  const res = await db.execute<{ team: string }>(sql`
    SELECT DISTINCT team FROM employees
    WHERE organization_id = ${organizationId} AND team IS NOT NULL
    ORDER BY team ASC
  `);
  return res.rows.map((r) => r.team);
}

// ---------------------------------------------------------------------------
// Shared aggregate shapes
// ---------------------------------------------------------------------------

export interface ActivityTotals {
  activeMs: number;
  modelMs: number;
  toolMs: number;
  interactiveMs: number;
  elapsedMs: number;
  idleMs: number;
  productiveMs: number;
  sessions: number;
  modelRequests: number;
  toolCalls: number;
  fileChanges: number;
  testsRun: number;
  testsFailed: number;
  buildsRun: number;
  buildsFailed: number;
  tokenInput: number | null;
  tokenOutput: number | null;
  avgSessionMs: number;
  activeEmployees: number;
}

const TOTALS_SELECT = sql`
  SUM(active_duration_ms)                                                AS active_ms,
  SUM(model_duration_ms)                                                 AS model_ms,
  SUM(tool_duration_ms)                                                  AS tool_ms,
  SUM(interactive_span_ms)                                               AS interactive_ms,
  SUM(elapsed_span_ms)                                                   AS elapsed_ms,
  SUM(idle_duration_ms)                                                  AS idle_ms,
  SUM(CASE WHEN classification = ANY(${sql.raw(`ARRAY['${PRODUCTIVE.join("','")}']`)})
           THEN active_duration_ms ELSE 0 END)                            AS productive_ms,
  COUNT(*)::int                                                          AS sessions,
  SUM(model_requests)                                                    AS model_requests,
  SUM(tool_calls)                                                        AS tool_calls,
  SUM(file_changes)                                                      AS file_changes,
  SUM(tests_run)                                                         AS tests_run,
  SUM(tests_failed)                                                      AS tests_failed,
  SUM(builds_run)                                                        AS builds_run,
  SUM(builds_failed)                                                     AS builds_failed,
  SUM(token_input)                                                       AS token_input,
  SUM(token_output)                                                      AS token_output,
  COUNT(DISTINCT developer_id)::int                                      AS active_employees
`;

interface TotalsRow extends Record<string, unknown> {
  active_ms: string | null;
  model_ms: string | null;
  tool_ms: string | null;
  interactive_ms: string | null;
  elapsed_ms: string | null;
  idle_ms: string | null;
  productive_ms: string | null;
  sessions: number;
  model_requests: string | null;
  tool_calls: string | null;
  file_changes: string | null;
  tests_run: string | null;
  tests_failed: string | null;
  builds_run: string | null;
  builds_failed: string | null;
  token_input: string | null;
  token_output: string | null;
  active_employees: number;
}

function toTotals(r: TotalsRow | undefined): ActivityTotals {
  const n = (v: string | null | undefined) => Number(v ?? 0);
  const sessions = r?.sessions ?? 0;
  const activeMs = n(r?.active_ms);
  return {
    activeMs,
    modelMs: n(r?.model_ms),
    toolMs: n(r?.tool_ms),
    interactiveMs: n(r?.interactive_ms),
    elapsedMs: n(r?.elapsed_ms),
    idleMs: n(r?.idle_ms),
    productiveMs: n(r?.productive_ms),
    sessions,
    modelRequests: n(r?.model_requests),
    toolCalls: n(r?.tool_calls),
    fileChanges: n(r?.file_changes),
    testsRun: n(r?.tests_run),
    testsFailed: n(r?.tests_failed),
    buildsRun: n(r?.builds_run),
    buildsFailed: n(r?.builds_failed),
    tokenInput: r?.token_input == null ? null : Number(r.token_input),
    tokenOutput: r?.token_output == null ? null : Number(r.token_output),
    avgSessionMs: sessions > 0 ? Math.round(activeMs / sessions) : 0,
    activeEmployees: r?.active_employees ?? 0,
  };
}

interface ScopeFilters {
  organizationId: string;
  developerId?: string;
  developerIds?: string[];
  provider?: string;
  team?: string;
  projectId?: string;
  /** Viewer display timezone — overrides org timezone for date/hour bucketing. */
  timeZone?: string;
}

function developerIdIn(column: string, developerIds?: string[]) {
  if (!developerIds?.length) return sql``;
  return sql`AND ${sql.raw(column)} IN (${sql.join(
    developerIds.map((id) => sql`${id}`),
    sql`, `,
  )})`;
}

function scopeWhere(f: ScopeFilters, range: DateRange) {
  const parts = [
    sql`s.organization_id = ${f.organizationId}`,
    sql`s.started_at >= ${range.from}`,
    sql`s.started_at < ${range.to}`,
  ];
  if (f.developerId) parts.push(sql`s.developer_id = ${f.developerId}`);
  if (f.developerIds?.length) {
    parts.push(
      sql`s.developer_id IN (${sql.join(
        f.developerIds.map((id) => sql`${id}`),
        sql`, `,
      )})`,
    );
  }
  if (f.provider) parts.push(sql`s.provider = ${f.provider}`);
  if (f.projectId) parts.push(sql`s.project_id = ${f.projectId}`);
  if (f.team) {
    parts.push(
      sql`s.developer_id IN (SELECT id FROM employees WHERE organization_id = ${f.organizationId} AND team = ${f.team})`,
    );
  }
  return sql.join(parts, sql` AND `);
}

export async function activityTotals(
  f: ScopeFilters,
  range: DateRange,
): Promise<ActivityTotals> {
  const res = await db.execute<TotalsRow>(sql`
    SELECT ${TOTALS_SELECT} FROM agent_sessions s WHERE ${scopeWhere(f, range)}
  `);
  return toTotals(res.rows[0]);
}

export interface TrendPoint {
  date: string;
  activeMs: number;
  productiveMs: number;
  idleMs: number;
  sessions: number;
  employees: number;
}

export async function dailyTrend(
  f: ScopeFilters,
  range: DateRange,
): Promise<TrendPoint[]> {
  const tz = await scopeTimezone(f);
  const res = await db.execute<{
    day: string;
    active_ms: string;
    productive_ms: string;
    idle_ms: string;
    sessions: number;
    employees: number;
  }>(sql`
    SELECT to_char((s.started_at AT TIME ZONE ${tz})::date, 'YYYY-MM-DD') AS day,
           SUM(s.active_duration_ms)                                      AS active_ms,
           SUM(CASE WHEN s.classification = ANY(${sql.raw(`ARRAY['${PRODUCTIVE.join("','")}']`)})
                    THEN s.active_duration_ms ELSE 0 END)                  AS productive_ms,
           SUM(s.idle_duration_ms)                                        AS idle_ms,
           COUNT(*)::int                                                  AS sessions,
           COUNT(DISTINCT s.developer_id)::int                            AS employees
    FROM agent_sessions s
    WHERE ${scopeWhere(f, range)}
    GROUP BY day ORDER BY day ASC
  `);

  const byDay = new Map(res.rows.map((r) => [r.day, r]));
  const out: TrendPoint[] = [];
  const cursor = new Date(range.from);
  const dayMs = 86_400_000;
  const spanDays = Math.ceil((range.to.getTime() - range.from.getTime()) / dayMs);
  for (let i = 0; i < Math.min(spanDays, 370); i++) {
    const key = new Date(cursor.getTime() + i * dayMs).toISOString().slice(0, 10);
    const r = byDay.get(key);
    out.push({
      date: key,
      activeMs: Number(r?.active_ms ?? 0),
      productiveMs: Number(r?.productive_ms ?? 0),
      idleMs: Number(r?.idle_ms ?? 0),
      sessions: r?.sessions ?? 0,
      employees: r?.employees ?? 0,
    });
  }
  return out;
}

export interface ToolUsage {
  provider: string;
  activeMs: number;
  modelMs: number;
  toolMs: number;
  sessions: number;
  employees: number;
  modelRequests: number;
  fileChanges: number;
  tokenInput: number | null;
  tokenOutput: number | null;
  lastUsedAt: string | null;
}

export async function toolDistribution(
  f: ScopeFilters,
  range: DateRange,
): Promise<ToolUsage[]> {
  const res = await db.execute<{
    provider: string;
    active_ms: string;
    model_ms: string;
    tool_ms: string;
    sessions: number;
    employees: number;
    model_requests: string;
    file_changes: string;
    token_input: string | null;
    token_output: string | null;
    sessions_with_tokens: number;
    last_used: Date | null;
  }>(sql`
    SELECT s.provider,
           SUM(s.active_duration_ms)                     AS active_ms,
           SUM(s.model_duration_ms)                      AS model_ms,
           SUM(s.tool_duration_ms)                       AS tool_ms,
           COUNT(*)::int                                 AS sessions,
           COUNT(DISTINCT s.developer_id)::int           AS employees,
           SUM(s.model_requests)                         AS model_requests,
           SUM(s.file_changes)                           AS file_changes,
           SUM(s.token_input)                            AS token_input,
           SUM(s.token_output)                           AS token_output,
           COUNT(*) FILTER (WHERE s.token_input IS NOT NULL OR s.token_output IS NOT NULL)::int
                                                         AS sessions_with_tokens,
           MAX(COALESCE(s.last_event_at, s.started_at))  AS last_used
    FROM agent_sessions s
    WHERE ${scopeWhere(f, range)}
    GROUP BY s.provider
    ORDER BY active_ms DESC
  `);
  return res.rows.map((r) => {
    const hasTokens = (r.sessions_with_tokens ?? 0) > 0;
    const tokenInput = hasTokens ? Number(r.token_input ?? 0) : null;
    const tokenOutput = hasTokens ? Number(r.token_output ?? 0) : null;
    return {
      provider: r.provider,
      activeMs: Number(r.active_ms ?? 0),
      modelMs: Number(r.model_ms ?? 0),
      toolMs: Number(r.tool_ms ?? 0),
      sessions: r.sessions,
      employees: r.employees,
      modelRequests: Number(r.model_requests ?? 0),
      fileChanges: Number(r.file_changes ?? 0),
      tokenInput,
      tokenOutput,
      lastUsedAt: r.last_used ? new Date(r.last_used).toISOString() : null,
    };
  });
}

export interface HourPattern {
  hour: number;
  activeMs: number;
  sessions: number;
}

/** Working-hour pattern in the organization timezone (§11 label rule). */
export async function hourOfDayPattern(
  f: ScopeFilters,
  range: DateRange,
): Promise<HourPattern[]> {
  const tz = await scopeTimezone(f);
  const res = await db.execute<{ hour: number; active_ms: string; sessions: number }>(sql`
    SELECT EXTRACT(HOUR FROM (s.started_at AT TIME ZONE ${tz}))::int AS hour,
           SUM(s.active_duration_ms)                                 AS active_ms,
           COUNT(*)::int                                             AS sessions
    FROM agent_sessions s
    WHERE ${scopeWhere(f, range)}
    GROUP BY hour ORDER BY hour ASC
  `);
  const byHour = new Map(res.rows.map((r) => [r.hour, r]));
  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    activeMs: Number(byHour.get(hour)?.active_ms ?? 0),
    sessions: byHour.get(hour)?.sessions ?? 0,
  }));
}

export interface WeekdayPattern {
  weekday: number;
  label: string;
  activeMs: number;
  sessions: number;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export async function weekdayPattern(
  f: ScopeFilters,
  range: DateRange,
): Promise<WeekdayPattern[]> {
  const tz = await scopeTimezone(f);
  const res = await db.execute<{ dow: number; active_ms: string; sessions: number }>(sql`
    SELECT EXTRACT(DOW FROM (s.started_at AT TIME ZONE ${tz}))::int AS dow,
           SUM(s.active_duration_ms)                                AS active_ms,
           COUNT(*)::int                                            AS sessions
    FROM agent_sessions s
    WHERE ${scopeWhere(f, range)}
    GROUP BY dow ORDER BY dow ASC
  `);
  const by = new Map(res.rows.map((r) => [r.dow, r]));
  return WEEKDAYS.map((label, weekday) => ({
    weekday,
    label,
    activeMs: Number(by.get(weekday)?.active_ms ?? 0),
    sessions: by.get(weekday)?.sessions ?? 0,
  }));
}

export interface ClassificationSlice {
  classification: string;
  sessions: number;
  activeMs: number;
  idleMs: number;
}

export async function classificationSplit(
  f: ScopeFilters,
  range: DateRange,
): Promise<ClassificationSlice[]> {
  const res = await db.execute<{
    classification: string;
    sessions: number;
    active_ms: string;
    idle_ms: string;
  }>(sql`
    SELECT s.classification,
           COUNT(*)::int             AS sessions,
           SUM(s.active_duration_ms) AS active_ms,
           SUM(s.idle_duration_ms)   AS idle_ms
    FROM agent_sessions s
    WHERE ${scopeWhere(f, range)}
    GROUP BY s.classification ORDER BY sessions DESC
  `);
  return res.rows.map((r) => ({
    classification: r.classification,
    sessions: r.sessions,
    activeMs: Number(r.active_ms ?? 0),
    idleMs: Number(r.idle_ms ?? 0),
  }));
}

export interface ToolCategorySlice {
  category: string;
  calls: number;
}

export async function toolCategoryBreakdown(
  f: ScopeFilters,
  range: DateRange,
): Promise<ToolCategorySlice[]> {
  const res = await db.execute<{ category: string; calls: string }>(sql`
    SELECT kv.key AS category, SUM((kv.value)::numeric)::bigint AS calls
    FROM agent_sessions s, jsonb_each_text(s.tool_categories) kv
    WHERE ${scopeWhere(f, range)}
    GROUP BY kv.key ORDER BY calls DESC
  `);
  return res.rows.map((r) => ({
    category: r.category,
    calls: Number(r.calls ?? 0),
  }));
}

export interface ModelUsageSlice {
  model: string;
  sessions: number;
}

export async function modelBreakdown(
  f: ScopeFilters,
  range: DateRange,
): Promise<ModelUsageSlice[]> {
  const res = await db.execute<{ model: string; sessions: number }>(sql`
    SELECT m.value AS model, COUNT(*)::int AS sessions
    FROM agent_sessions s, jsonb_array_elements_text(s.models_used) m
    WHERE ${scopeWhere(f, range)}
    GROUP BY m.value ORDER BY sessions DESC
  `);
  return res.rows;
}

export interface CoverageSummary {
  gapEvents: number;
  pausedConnectors: number;
  staleConnectors: number;
  offlineConnectors: number;
  partialSessions: number;
  unassignedSessions: number;
  employeesWithoutTelemetry: number;
}

export async function coverageSummary(
  organizationId: string,
  range: DateRange,
  developerIds?: string[],
): Promise<CoverageSummary> {
  const scope: ScopeFilters = { organizationId, developerIds };
  const [gaps, sessionsRow, health, silent] = await Promise.all([
    db.execute<{ count: number }>(sql`
      SELECT COUNT(*)::int AS count FROM activity_events
      WHERE organization_id = ${organizationId}
        AND occurred_at >= ${range.from} AND occurred_at < ${range.to}
        AND event_type IN ('telemetry_gap_started','connector_paused','upload_failed','provider_capability_missing')
        ${developerIdIn("activity_events.developer_id", developerIds)}
    `),
    db.execute<{ partial: number; unassigned: number }>(sql`
      SELECT COUNT(*) FILTER (WHERE s.coverage_state <> 'complete')::int AS partial,
             COUNT(*) FILTER (WHERE s.unassigned)::int                   AS unassigned
      FROM agent_sessions s WHERE ${scopeWhere(scope, range)}
    `),
    db.execute<{ paused: number; stale: number; offline: number }>(sql`
      WITH h AS (
        SELECT d.developer_id,
               bool_or(
                 ch.paused = 1
               ) AS paused,
               bool_or(
                 ch.paused IS DISTINCT FROM 1
                 AND ch.last_heartbeat IS NOT NULL
                 AND ch.last_heartbeat >= NOW() - INTERVAL '5 minutes'
               ) AS online,
               bool_or(
                 ch.last_heartbeat IS NOT NULL
                 AND ch.last_heartbeat < NOW() - INTERVAL '5 minutes'
               ) AS stale,
               bool_or(
                 ch.last_heartbeat IS NULL
               ) AS offline
        FROM devices d LEFT JOIN connector_health ch ON ch.device_id = d.id
        WHERE d.organization_id = ${organizationId} AND d.revoked_at IS NULL AND d.kind = 'connector'
          ${developerIdIn("d.developer_id", developerIds)}
        GROUP BY d.developer_id
      )
      SELECT COUNT(*) FILTER (WHERE paused AND NOT online)::int AS paused,
             COUNT(*) FILTER (WHERE stale AND NOT online AND NOT paused)::int AS stale,
             COUNT(*) FILTER (WHERE offline AND NOT online AND NOT paused AND NOT stale)::int AS offline
      FROM h
    `),
    db.execute<{ count: number }>(sql`
      SELECT COUNT(*)::int AS count FROM employees e
      WHERE e.organization_id = ${organizationId} AND e.status = 'active'
        ${developerIdIn("e.id", developerIds)}
        AND NOT EXISTS (
          SELECT 1 FROM agent_sessions s
          WHERE s.developer_id = e.id
            AND s.started_at >= ${range.from} AND s.started_at < ${range.to}
        )
    `),
  ]);

  return {
    gapEvents: gaps.rows[0]?.count ?? 0,
    pausedConnectors: health.rows[0]?.paused ?? 0,
    staleConnectors: health.rows[0]?.stale ?? 0,
    offlineConnectors: health.rows[0]?.offline ?? 0,
    partialSessions: sessionsRow.rows[0]?.partial ?? 0,
    unassignedSessions: sessionsRow.rows[0]?.unassigned ?? 0,
    employeesWithoutTelemetry: silent.rows[0]?.count ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Composed views
// ---------------------------------------------------------------------------

export interface OrganizationAnalytics {
  range: { from: string; to: string };
  totals: ActivityTotals;
  previousTotals: ActivityTotals;
  headcount: { total: number; active: number; connected: number };
  dailyTrend: TrendPoint[];
  tools: ToolUsage[];
  hourPattern: HourPattern[];
  weekdayPattern: WeekdayPattern[];
  classifications: ClassificationSlice[];
  toolCategories: ToolCategorySlice[];
  coverage: CoverageSummary;
  teams: { team: string; activeMs: number; sessions: number; employees: number }[];
}

export async function organizationAnalytics(input: {
  organizationId: string;
  range: DateRange;
  team?: string;
  provider?: string;
  developerIds?: string[];
  timeZone?: string;
}): Promise<OrganizationAnalytics> {
  const scope: ScopeFilters = {
    organizationId: input.organizationId,
    team: input.team,
    provider: input.provider,
    developerIds: input.developerIds,
    timeZone: input.timeZone,
  };
  const prev = previousRange(input.range);

  const [
    totals,
    previousTotals,
    trend,
    tools,
    hours,
    weekdays,
    classes,
    categories,
    coverage,
    headcountRes,
    teamRes,
  ] = await Promise.all([
    activityTotals(scope, input.range),
    activityTotals(scope, prev),
    dailyTrend(scope, input.range),
    toolDistribution(scope, input.range),
    hourOfDayPattern(scope, input.range),
    weekdayPattern(scope, input.range),
    classificationSplit(scope, input.range),
    toolCategoryBreakdown(scope, input.range),
    coverageSummary(input.organizationId, input.range, input.developerIds),
    db.execute<{ total: number; connected: number }>(sql`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (
               WHERE EXISTS (SELECT 1 FROM devices d
                             WHERE d.developer_id = e.id AND d.revoked_at IS NULL AND d.kind = 'connector')
             )::int AS connected
      FROM employees e
      WHERE e.organization_id = ${input.organizationId} AND e.status = 'active'
    `),
    db.execute<{ team: string; active_ms: string; sessions: number; employees: number }>(sql`
      SELECT COALESCE(e.team, 'Unassigned') AS team,
             SUM(s.active_duration_ms)      AS active_ms,
             COUNT(*)::int                  AS sessions,
             COUNT(DISTINCT s.developer_id)::int AS employees
      FROM agent_sessions s
      JOIN employees e ON e.id = s.developer_id
      WHERE ${scopeWhere(scope, input.range)}
      GROUP BY COALESCE(e.team, 'Unassigned')
      ORDER BY active_ms DESC
    `),
  ]);

  return {
    range: { from: input.range.from.toISOString(), to: input.range.to.toISOString() },
    totals,
    previousTotals,
    headcount: {
      total: headcountRes.rows[0]?.total ?? 0,
      connected: headcountRes.rows[0]?.connected ?? 0,
      active: totals.activeEmployees,
    },
    dailyTrend: trend,
    tools,
    hourPattern: hours,
    weekdayPattern: weekdays,
    classifications: classes,
    toolCategories: categories,
    coverage,
    teams: teamRes.rows.map((r) => ({
      team: r.team,
      activeMs: Number(r.active_ms ?? 0),
      sessions: r.sessions,
      employees: r.employees,
    })),
  };
}

export interface EmployeeProfile {
  id: string;
  displayName: string;
  email: string | null;
  team: string | null;
  title: string | null;
  status: string;
  joinedAt: string | null;
}

export async function getEmployee(
  organizationId: string,
  developerId: string,
): Promise<EmployeeProfile | null> {
  const res = await db.execute<{
    id: string;
    display_name: string;
    email: string | null;
    team: string | null;
    title: string | null;
    status: string;
    joined_at: Date | null;
  }>(sql`
    SELECT id, display_name, email, team, title, status, joined_at
    FROM employees WHERE id = ${developerId} AND organization_id = ${organizationId}
  `);
  const r = res.rows[0];
  if (!r) return null;
  return {
    id: r.id,
    displayName: r.display_name,
    email: r.email,
    team: r.team,
    title: r.title,
    status: r.status,
    joinedAt: r.joined_at ? new Date(r.joined_at).toISOString() : null,
  };
}

export interface EmployeeDevice {
  deviceId: string;
  provider: string | null;
  label: string | null;
  connectorVersion: string | null;
  lastHeartbeat: string | null;
  queueDepth: number | null;
  paused: boolean;
  state: "online" | "stale" | "paused" | "offline";
}

export async function employeeDevices(
  organizationId: string,
  developerId: string,
): Promise<EmployeeDevice[]> {
  const res = await db.execute<{
    id: string;
    provider: string | null;
    label: string | null;
    version: string | null;
    last_heartbeat: Date | null;
    queue_depth: number | null;
    paused: number | null;
    health_provider: string | null;
  }>(sql`
    SELECT d.id, d.provider, d.label,
           ch.version, ch.last_heartbeat, ch.queue_depth, ch.paused,
           ch.provider AS health_provider
    FROM devices d
    LEFT JOIN connector_health ch ON ch.device_id = d.id
    WHERE d.organization_id = ${organizationId}
      AND d.developer_id = ${developerId}
      AND d.revoked_at IS NULL AND d.kind = 'connector'
    ORDER BY d.created_at ASC
  `);
  return res.rows.map((r) => ({
    deviceId: r.id,
    provider: r.provider ?? r.health_provider,
    label: r.label,
    connectorVersion: r.version,
    lastHeartbeat: r.last_heartbeat ? new Date(r.last_heartbeat).toISOString() : null,
    queueDepth: r.queue_depth,
    paused: r.paused === 1,
    state: connectorStateOf(r.paused, r.last_heartbeat),
  }));
}

export interface IdlePeriod {
  from: string;
  to: string;
  durationMs: number;
  reason: "idle_gap" | "coverage_gap";
}

/**
 * Gaps longer than the idle threshold between consecutive observed events,
 * capped at four hours so overnight and weekend breaks are not reported as
 * idleness (SEC-009 — absence of telemetry is never evidence of absence of work).
 */
export async function idlePeriods(
  organizationId: string,
  developerId: string,
  range: DateRange,
  limit = 20,
): Promise<IdlePeriod[]> {
  const res = await db.execute<{
    gap_start: Date;
    gap_end: Date;
    gap_ms: string;
    had_gap_event: boolean;
  }>(sql`
    WITH ordered AS (
      SELECT occurred_at,
             LEAD(occurred_at) OVER (ORDER BY occurred_at) AS next_at,
             event_type
      FROM activity_events
      WHERE organization_id = ${organizationId}
        AND developer_id = ${developerId}
        AND occurred_at >= ${range.from} AND occurred_at < ${range.to}
        AND event_type NOT IN ('heartbeat_sent')
    )
    SELECT occurred_at AS gap_start,
           next_at     AS gap_end,
           (EXTRACT(EPOCH FROM (next_at - occurred_at)) * 1000)::bigint AS gap_ms,
           event_type IN ('telemetry_gap_started','connector_paused') AS had_gap_event
    FROM ordered
    WHERE next_at IS NOT NULL
      AND next_at - occurred_at > INTERVAL '10 minutes'
      AND next_at - occurred_at < INTERVAL '4 hours'
    ORDER BY gap_ms DESC
    LIMIT ${limit}
  `);
  return res.rows.map((r) => ({
    from: new Date(r.gap_start).toISOString(),
    to: new Date(r.gap_end).toISOString(),
    durationMs: Number(r.gap_ms ?? 0),
    reason: r.had_gap_event ? "coverage_gap" : "idle_gap",
  }));
}

export interface ProjectUsage {
  projectId: string | null;
  name: string;
  activeMs: number;
  sessions: number;
}

export async function projectBreakdown(
  f: ScopeFilters,
  range: DateRange,
): Promise<ProjectUsage[]> {
  const res = await db.execute<{
    project_id: string | null;
    name: string | null;
    active_ms: string;
    sessions: number;
  }>(sql`
    SELECT s.project_id, p.name,
           SUM(s.active_duration_ms) AS active_ms,
           COUNT(*)::int             AS sessions
    FROM agent_sessions s
    LEFT JOIN projects p ON p.id = s.project_id
    WHERE ${scopeWhere(f, range)}
    GROUP BY s.project_id, p.name
    ORDER BY active_ms DESC
  `);
  return res.rows.map((r) => ({
    projectId: r.project_id,
    name: r.name ?? "Unassigned",
    activeMs: Number(r.active_ms ?? 0),
    sessions: r.sessions,
  }));
}

const FILE_CHANGE_TYPES = ["file_created", "file_modified", "file_deleted"] as const;

function eventScope(f: ScopeFilters, range: DateRange) {
  const parts = [
    sql`e.organization_id = ${f.organizationId}`,
    sql`e.occurred_at >= ${range.from}`,
    sql`e.occurred_at < ${range.to}`,
    sql`e.event_type IN (${sql.join(
      FILE_CHANGE_TYPES.map((t) => sql`${t}`),
      sql`, `,
    )})`,
    // Only edits an AI agent reported — never a person's own saves.
    sql.raw(AGENT_REPORTED_SQL("e")),
  ];
  if (f.developerId) parts.push(sql`e.developer_id = ${f.developerId}`);
  if (f.developerIds?.length) {
    parts.push(
      sql`e.developer_id IN (${sql.join(
        f.developerIds.map((id) => sql`${id}`),
        sql`, `,
      )})`,
    );
  }
  if (f.provider) parts.push(sql`e.payload->>'provider' = ${f.provider}`);
  if (f.team) {
    parts.push(
      sql`e.developer_id IN (SELECT id FROM employees WHERE organization_id = ${f.organizationId} AND team = ${f.team})`,
    );
  }
  return sql.join(parts, sql` AND `);
}

/** Workspaces named by the connector (folder name), with observed file changes. */
export async function workspaceFileChanges(
  f: ScopeFilters,
  range: DateRange,
): Promise<{ name: string; fileChanges: number; sessions: number; activeMs: number }[]> {
  const res = await db.execute<{
    name: string;
    file_changes: number;
    sessions: number;
    active_ms: string;
  }>(sql`
    WITH hits AS (
      SELECT COALESCE(NULLIF(e.payload->'metadata'->>'path_category', ''), 'Unassigned workspace') AS name,
             e.session_id,
             COUNT(*)::int AS file_changes
      FROM activity_events e
      WHERE ${eventScope(f, range)}
      GROUP BY 1, 2
    )
    SELECT h.name,
           SUM(h.file_changes)::int AS file_changes,
           COUNT(DISTINCT h.session_id)::int AS sessions,
           COALESCE(SUM(s.active_duration_ms), 0) AS active_ms
    FROM hits h
    JOIN agent_sessions s ON s.id = h.session_id
    GROUP BY h.name
    ORDER BY file_changes DESC
    LIMIT 12
  `);
  return res.rows.map((r) => ({
    name: r.name,
    fileChanges: r.file_changes,
    sessions: r.sessions,
    activeMs: Number(r.active_ms ?? 0),
  }));
}

/** Daily file-change counts. This is agent file activity, not git commits. */
export async function fileChangeTrend(
  f: ScopeFilters,
  range: DateRange,
): Promise<{ date: string; fileChanges: number }[]> {
  const tz = await scopeTimezone(f);
  const res = await db.execute<{ day: string; file_changes: number }>(sql`
    SELECT to_char((e.occurred_at AT TIME ZONE ${tz})::date, 'YYYY-MM-DD') AS day,
           COUNT(*)::int AS file_changes
    FROM activity_events e
    WHERE ${eventScope(f, range)}
    GROUP BY day
    ORDER BY day ASC
  `);
  const byDay = new Map(res.rows.map((r) => [r.day, r.file_changes]));
  const out: { date: string; fileChanges: number }[] = [];
  const cursor = new Date(range.from);
  const dayMs = 86_400_000;
  const spanDays = Math.max(1, Math.ceil((range.to.getTime() - range.from.getTime()) / dayMs));
  for (let i = 0; i < spanDays; i++) {
    const day = cursor.toISOString().slice(0, 10);
    out.push({ date: day, fileChanges: byDay.get(day) ?? 0 });
    cursor.setTime(cursor.getTime() + dayMs);
  }
  return out;
}
