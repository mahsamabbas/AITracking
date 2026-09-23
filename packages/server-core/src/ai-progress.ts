import { sql } from "drizzle-orm";
import { PROVIDER_CAPABILITIES, providerLabel } from "@techlio/event-schema";
import { db } from "./db.js";
import { orgTimezone, type DateRange } from "./analytics.js";

/**
 * AI Progress — the per-person, per-provider rollup behind the employee hub.
 *
 * Every figure is computed here from agent_sessions (precomputed by
 * computeSessionMetrics) or activity_events; the browser only formats.
 * Lineage for each field: docs/ai-progress-data-lineage.md.
 */

const AREA_LABEL: Record<string, string> = {
  token_totals: "Token totals",
  model_call_timing: "Per-call model timing (model duration is the whole agent turn)",
  session_boundaries: "Session boundaries",
  model_request: "Model requests",
  tool_calls: "Tool calls",
  hourly_summary: "Hourly summaries",
};

export interface EffectiveCapability {
  missing: string[];
  unavailable: string[];
  /** "connector" = live report from this person's connector; "catalog" = static fallback. */
  source: "connector" | "catalog";
  reportedAt: string | null;
  observedVia: string[];
  tier: "A" | "B";
  hourly: boolean;
  note: string | null;
  emptyState: string | null;
}

export interface ProviderProgress {
  provider: string;
  label: string;
  capability: EffectiveCapability;
  sessions: number;
  activeMs: number;
  modelMs: number;
  toolMs: number;
  modelRequests: number;
  toolCalls: number;
  fileChanges: number;
  testsRun: number;
  testsPassed: number;
  testsFailed: number;
  buildsRun: number;
  buildsFailed: number;
  /** null = no session in range reported tokens (not zero). */
  tokenInput: number | null;
  tokenOutput: number | null;
  models: { model: string; sessions: number }[];
  lastActivityAt: string | null;
  /** Share of this person's agent active time in range, 0–100. */
  sharePct: number;
}

export interface TierBDay {
  date: string;
  provider: string;
  billableRequests: number | null;
  chatRequests: number | null;
  agentRequests: number | null;
  completions: number | null;
  suggestions: number | null;
  acceptances: number | null;
  linesAdded: number | null;
  linesDeleted: number | null;
}

export interface AiProgress {
  range: { from: string; to: string };
  providers: ProviderProgress[];
  tierBDaily: TierBDay[];
  coverage: {
    gapCount: number;
    gapMs: number;
    observedSpanMs: number;
    /** Observed session time ÷ (observed + coverage-gap time); null when neither exists. */
    observedPct: number | null;
  };
}

const n = (v: unknown) => (v == null ? 0 : Number(v));
const nOrNull = (v: unknown) => (v == null ? null : Number(v));

/**
 * The capability to show for a provider: the newest connector report from this
 * person's devices (last 48h), otherwise the static catalog.
 */
export async function effectiveCapabilities(
  organizationId: string,
  developerId: string,
): Promise<Map<string, EffectiveCapability>> {
  const res = await db.execute<{ capabilities: unknown; capabilities_at: Date | null }>(sql`
    SELECT ch.capabilities, ch.capabilities_at
    FROM devices d
    JOIN connector_health ch ON ch.device_id = d.id
    WHERE d.organization_id = ${organizationId}
      AND d.developer_id = ${developerId}
      AND d.revoked_at IS NULL AND d.kind = 'connector'
      AND ch.capabilities IS NOT NULL
      AND ch.capabilities_at > NOW() - INTERVAL '48 hours'
    ORDER BY ch.capabilities_at DESC
  `);
  const out = new Map<string, EffectiveCapability>();
  for (const row of res.rows) {
    const providers = (row.capabilities as { providers?: Record<string, { missing: string[]; sources: string[] }> })
      ?.providers ?? {};
    for (const [id, report] of Object.entries(providers)) {
      if (out.has(id)) continue; // newest report wins
      const cat = PROVIDER_CAPABILITIES[id];
      out.set(id, {
        missing: report.missing,
        unavailable: report.missing.map((m) => AREA_LABEL[m] ?? m),
        source: "connector",
        reportedAt: row.capabilities_at ? new Date(row.capabilities_at).toISOString() : null,
        observedVia: report.sources ?? [],
        tier: cat?.tier ?? "B",
        hourly: cat?.hourly ?? false,
        note: cat?.note ?? null,
        emptyState: report.missing.length ? cat?.emptyState ?? null : null,
      });
    }
  }
  return out;
}

export function catalogCapability(provider: string): EffectiveCapability {
  const cat = PROVIDER_CAPABILITIES[provider];
  const missing = cat?.missing ?? [];
  return {
    missing,
    unavailable: missing.map((m) => AREA_LABEL[m] ?? m),
    source: "catalog",
    reportedAt: null,
    observedVia: [],
    tier: cat?.tier ?? "B",
    hourly: cat?.hourly ?? false,
    note: cat?.note ?? null,
    emptyState: cat?.emptyState || null,
  };
}

export async function aiProgress(input: {
  organizationId: string;
  developerId: string;
  range: DateRange;
}): Promise<AiProgress> {
  const { organizationId, developerId, range } = input;
  const tz = orgTimezone();

  const [bySession, models, tierB, gaps, caps] = await Promise.all([
    db.execute<Record<string, unknown> & { provider: string }>(sql`
      SELECT s.provider,
             COUNT(*)::int                  AS sessions,
             SUM(s.active_duration_ms)      AS active_ms,
             SUM(s.model_duration_ms)       AS model_ms,
             SUM(s.tool_duration_ms)        AS tool_ms,
             SUM(s.model_requests)          AS model_requests,
             SUM(s.tool_calls)              AS tool_calls,
             SUM(s.file_changes)            AS file_changes,
             SUM(s.tests_run)               AS tests_run,
             SUM(s.tests_passed)            AS tests_passed,
             SUM(s.tests_failed)            AS tests_failed,
             SUM(s.builds_run)              AS builds_run,
             SUM(s.builds_failed)           AS builds_failed,
             SUM(s.token_input)             AS token_input,
             SUM(s.token_output)            AS token_output,
             SUM(s.elapsed_span_ms)         AS elapsed_ms,
             MAX(COALESCE(s.last_event_at, s.started_at)) AS last_at
      FROM agent_sessions s
      WHERE s.organization_id = ${organizationId}
        AND s.developer_id = ${developerId}
        AND s.started_at >= ${range.from} AND s.started_at < ${range.to}
      GROUP BY s.provider
    `),
    db.execute<{ provider: string; model: string; sessions: number }>(sql`
      SELECT s.provider, m.value AS model, COUNT(*)::int AS sessions
      FROM agent_sessions s, jsonb_array_elements_text(s.models_used) m
      WHERE s.organization_id = ${organizationId}
        AND s.developer_id = ${developerId}
        AND s.started_at >= ${range.from} AND s.started_at < ${range.to}
      GROUP BY s.provider, m.value
      ORDER BY sessions DESC
    `),
    // Tier B: provider daily reports. SUM over no values is NULL, so a metric
    // the provider never reported stays null rather than becoming 0.
    db.execute<Record<string, unknown> & { day: string; provider: string }>(sql`
      SELECT COALESCE(e.payload->'metadata'->>'aggregate_day',
                      to_char((e.occurred_at AT TIME ZONE ${tz})::date, 'YYYY-MM-DD')) AS day,
             e.payload->>'provider' AS provider,
             SUM((e.payload->'metadata'->>'billable_requests_count')::bigint) AS billable,
             SUM((e.payload->'metadata'->>'chat_requests_count')::bigint)     AS chat,
             SUM((e.payload->'metadata'->>'agent_requests_count')::bigint)    AS agent,
             SUM((e.payload->'metadata'->>'completions_count')::bigint)       AS completions,
             SUM((e.payload->'metadata'->>'suggestions_count')::bigint)       AS suggestions,
             SUM((e.payload->'metadata'->>'acceptances_count')::bigint)       AS acceptances,
             SUM((e.payload->'metadata'->>'lines_added')::bigint)             AS lines_added,
             SUM((e.payload->'metadata'->>'lines_deleted')::bigint)           AS lines_deleted
      FROM activity_events e
      WHERE e.organization_id = ${organizationId}
        AND e.developer_id = ${developerId}
        AND e.event_type = 'provider_daily_aggregate'
        AND e.occurred_at >= ${range.from} AND e.occurred_at < ${range.to}
      GROUP BY 1, 2
      ORDER BY 1 ASC
    `),
    // Coverage gaps: each start paired with the next end on the same device;
    // an unclosed gap runs to the end of the range (or now).
    db.execute<{ gap_count: number; gap_ms: string | null }>(sql`
      WITH starts AS (
        SELECT e.device_id, e.occurred_at AS started,
               (SELECT MIN(x.occurred_at) FROM activity_events x
                 WHERE x.device_id = e.device_id
                   AND x.event_type = 'telemetry_gap_ended'
                   AND x.occurred_at >= e.occurred_at) AS ended
        FROM activity_events e
        WHERE e.organization_id = ${organizationId}
          AND e.developer_id = ${developerId}
          AND e.event_type = 'telemetry_gap_started'
          AND e.occurred_at >= ${range.from} AND e.occurred_at < ${range.to}
      )
      SELECT COUNT(*)::int AS gap_count,
             SUM(EXTRACT(EPOCH FROM (LEAST(COALESCE(ended, NOW()), ${range.to}::timestamptz, NOW()) - started)) * 1000)::bigint AS gap_ms
      FROM starts
    `),
    effectiveCapabilities(organizationId, developerId),
  ]);

  const totalActive = bySession.rows.reduce((s, r) => s + n(r.active_ms), 0);
  const modelsBy = new Map<string, { model: string; sessions: number }[]>();
  for (const m of models.rows) {
    const list = modelsBy.get(m.provider) ?? [];
    list.push({ model: m.model, sessions: m.sessions });
    modelsBy.set(m.provider, list);
  }

  const providers: ProviderProgress[] = bySession.rows.map((r) => ({
    provider: r.provider,
    label: providerLabel(r.provider),
    capability: caps.get(r.provider) ?? catalogCapability(r.provider),
    sessions: n(r.sessions),
    activeMs: n(r.active_ms),
    modelMs: n(r.model_ms),
    toolMs: n(r.tool_ms),
    modelRequests: n(r.model_requests),
    toolCalls: n(r.tool_calls),
    fileChanges: n(r.file_changes),
    testsRun: n(r.tests_run),
    testsPassed: n(r.tests_passed),
    testsFailed: n(r.tests_failed),
    buildsRun: n(r.builds_run),
    buildsFailed: n(r.builds_failed),
    tokenInput: nOrNull(r.token_input),
    tokenOutput: nOrNull(r.token_output),
    models: (modelsBy.get(r.provider) ?? []).slice(0, 5),
    lastActivityAt: r.last_at ? new Date(r.last_at as string).toISOString() : null,
    sharePct: totalActive > 0 ? Math.round((n(r.active_ms) / totalActive) * 100) : 0,
  }));
  providers.sort((a, b) => b.activeMs - a.activeMs);

  const tierBDaily: TierBDay[] = tierB.rows.map((r) => ({
    date: String(r.day).slice(0, 10),
    provider: r.provider,
    billableRequests: nOrNull(r.billable),
    chatRequests: nOrNull(r.chat),
    agentRequests: nOrNull(r.agent),
    completions: nOrNull(r.completions),
    suggestions: nOrNull(r.suggestions),
    acceptances: nOrNull(r.acceptances),
    linesAdded: nOrNull(r.lines_added),
    linesDeleted: nOrNull(r.lines_deleted),
  }));

  // Tier B providers with reports but no sessions still get a card.
  for (const provider of new Set(tierBDaily.map((d) => d.provider))) {
    if (providers.some((p) => p.provider === provider)) continue;
    providers.push({
      provider,
      label: providerLabel(provider),
      capability: caps.get(provider) ?? catalogCapability(provider),
      sessions: 0, activeMs: 0, modelMs: 0, toolMs: 0, modelRequests: 0, toolCalls: 0,
      fileChanges: 0, testsRun: 0, testsPassed: 0, testsFailed: 0, buildsRun: 0, buildsFailed: 0,
      tokenInput: null, tokenOutput: null, models: [], lastActivityAt: null, sharePct: 0,
    });
  }

  const observedSpanMs = bySession.rows.reduce((s, r) => s + n(r.elapsed_ms), 0);
  const gapMs = Math.max(0, n(gaps.rows[0]?.gap_ms));
  return {
    range: { from: range.from.toISOString(), to: range.to.toISOString() },
    providers,
    tierBDaily,
    coverage: {
      gapCount: gaps.rows[0]?.gap_count ?? 0,
      gapMs,
      observedSpanMs,
      observedPct:
        observedSpanMs + gapMs > 0 ? Math.round((observedSpanMs / (observedSpanMs + gapMs)) * 1000) / 10 : null,
    },
  };
}

export interface ProgressTimeline {
  date: string;
  timezone: string;
  hours: {
    hour: number;
    byProvider: Record<string, { modelRequests: number; toolCalls: number; fileChanges: number; checks: number; failures: number }>;
    coverageEvents: number;
  }[];
  sessions: {
    id: string;
    provider: string;
    startedAt: string;
    endedAt: string | null;
    activeMs: number;
    classification: string;
    coverageState: string;
  }[];
}

/** "What happened today": hourly activity by provider for one org-timezone day. */
export async function aiProgressTimeline(input: {
  organizationId: string;
  developerId: string;
  date: string; // YYYY-MM-DD in org timezone
}): Promise<ProgressTimeline> {
  const tz = orgTimezone();
  const { organizationId, developerId, date } = input;
  const [events, sessions] = await Promise.all([
    db.execute<{ hour: number; provider: string; event_type: string; status: string | null; count: number }>(sql`
      SELECT EXTRACT(HOUR FROM (e.occurred_at AT TIME ZONE ${tz}))::int AS hour,
             e.payload->>'provider' AS provider,
             e.event_type,
             e.payload->>'status' AS status,
             COUNT(*)::int AS count
      FROM activity_events e
      WHERE e.organization_id = ${organizationId}
        AND e.developer_id = ${developerId}
        AND (e.occurred_at AT TIME ZONE ${tz})::date = ${date}::date
        AND e.event_type IN ('model_request_completed','tool_completed','file_created','file_modified','file_deleted',
                             'test_completed','build_completed','lint_completed','typecheck_completed',
                             'telemetry_gap_started','connector_paused','upload_failed')
      GROUP BY 1, 2, 3, 4
    `),
    db.execute<{
      id: string; provider: string; started_at: Date; ended_at: Date | null;
      active_duration_ms: string; classification: string; coverage_state: string;
    }>(sql`
      SELECT id, provider, started_at, ended_at, active_duration_ms, classification, coverage_state
      FROM agent_sessions
      WHERE organization_id = ${organizationId}
        AND developer_id = ${developerId}
        AND (started_at AT TIME ZONE ${tz})::date = ${date}::date
      ORDER BY started_at ASC
    `),
  ]);

  const hours = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    byProvider: {} as ProgressTimeline["hours"][number]["byProvider"],
    coverageEvents: 0,
  }));
  for (const r of events.rows) {
    const h = hours[r.hour];
    if (!h) continue;
    if (["telemetry_gap_started", "connector_paused", "upload_failed"].includes(r.event_type)) {
      h.coverageEvents += r.count;
      continue;
    }
    const b = (h.byProvider[r.provider] ??= { modelRequests: 0, toolCalls: 0, fileChanges: 0, checks: 0, failures: 0 });
    if (r.event_type === "model_request_completed") b.modelRequests += r.count;
    else if (r.event_type === "tool_completed") b.toolCalls += r.count;
    else if (r.event_type.startsWith("file_")) b.fileChanges += r.count;
    else b.checks += r.count;
    if (r.status === "failed") b.failures += r.count;
  }

  return {
    date,
    timezone: tz,
    hours,
    sessions: sessions.rows.map((s) => ({
      id: s.id,
      provider: s.provider,
      startedAt: new Date(s.started_at).toISOString(),
      endedAt: s.ended_at ? new Date(s.ended_at).toISOString() : null,
      activeMs: Number(s.active_duration_ms ?? 0),
      classification: s.classification,
      coverageState: s.coverage_state,
    })),
  };
}
