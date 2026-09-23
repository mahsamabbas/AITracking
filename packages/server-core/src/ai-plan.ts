import { sql } from "drizzle-orm";
import { db } from "./db.js";
import { PROVIDER_CAPABILITIES } from "@techlio/event-schema";

function orgTimezone(): string {
  return process.env.ORG_TIMEZONE ?? "UTC";
}

function pgErrorCode(err: unknown): string | undefined {
  if (err && typeof err === "object" && "code" in err) {
    return String((err as { code: unknown }).code);
  }
  return undefined;
}

function calendarMonthBoundsJs(): { from: Date; to: Date; label: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const label = now.toLocaleString("en-US", { month: "long", year: "numeric" });
  return { from, to, label };
}

const TRACKED_PROVIDERS = ["cursor", "claude_code"] as const;
type TrackedProvider = (typeof TRACKED_PROVIDERS)[number];

export type ProviderPlanConfig = {
  monthlyTokenBudget?: number;
  /** Mirrors Cursor billing when set by an admin (fast/premium request pool). */
  monthlyRequestBudget?: number;
  planName?: string;
};

export type AiPlanLimits = Partial<Record<TrackedProvider, ProviderPlanConfig>>;

export type AiUsageUnit = "tokens" | "model_requests" | "cursor_admin_requests";

export interface EmployeeAiSubscriptionRow {
  provider: string;
  label: string;
  periodLabel: string;
  planName: string | null;
  usageUnit: AiUsageUnit;
  tokenInput: number | null;
  tokenOutput: number | null;
  tokensUsed: number | null;
  modelRequests: number | null;
  completionsCount: number | null;
  chatRequestsCount: number | null;
  monthlyLimit: number | null;
  remaining: number | null;
  tokensFromTelemetry: boolean;
  limitConfigured: boolean;
  usageSource: "session_tokens" | "session_model_requests" | "tier_b_pull" | "cursor_admin_api" | "none";
}

function defaultLimits(): AiPlanLimits {
  const raw = process.env.TECHLIO_DEFAULT_AI_PLAN_LIMITS;
  if (raw) {
    try {
      return JSON.parse(raw) as AiPlanLimits;
    } catch {
      /* ignore */
    }
  }
  return {
    cursor: { monthlyRequestBudget: 500, planName: "Cursor plan" },
    claude_code: { monthlyTokenBudget: 2_000_000, planName: "Claude Code" },
  };
}

export async function getOrgAiPlanLimits(organizationId: string): Promise<AiPlanLimits> {
  try {
    const res = await db.execute<{ ai_plan_limits: AiPlanLimits | null }>(sql`
      SELECT ai_plan_limits FROM organizations WHERE id = ${organizationId}
    `);
    const fromDb = res.rows[0]?.ai_plan_limits;
    if (fromDb && typeof fromDb === "object") {
      return { ...defaultLimits(), ...fromDb };
    }
    return defaultLimits();
  } catch (err) {
    if (pgErrorCode(err) === "42703") return defaultLimits();
    throw err;
  }
}

/** Calendar month in org timezone (label + UTC bounds for session queries). */
export async function currentCalendarMonthBounds(): Promise<{
  from: Date;
  to: Date;
  label: string;
}> {
  try {
    const tz = orgTimezone();
    const res = await db.execute<{ month_start: Date; month_end: Date; label: string }>(sql`
      SELECT
        (date_trunc('month', timezone(${tz}, now()))) AT TIME ZONE ${tz} AS month_start,
        (date_trunc('month', timezone(${tz}, now())) + interval '1 month') AT TIME ZONE ${tz} AS month_end,
        to_char(timezone(${tz}, now()), 'FMMonth YYYY') AS label
    `);
    const row = res.rows[0];
    return {
      from: new Date(row?.month_start ?? new Date()),
      to: new Date(row?.month_end ?? new Date()),
      label: row?.label?.trim() ?? "This month",
    };
  } catch {
    return calendarMonthBoundsJs();
  }
}

async function employeeAiProviderPresence(
  organizationId: string,
  developerId: string,
  monthFrom: Date,
): Promise<Set<TrackedProvider>> {
  const res = await db.execute<{ provider: string }>(sql`
    SELECT DISTINCT provider FROM (
      SELECT COALESCE(d.provider, ch.provider) AS provider
      FROM devices d
      LEFT JOIN connector_health ch ON ch.device_id = d.id
      WHERE d.organization_id = ${organizationId}
        AND d.developer_id = ${developerId}
        AND d.revoked_at IS NULL
      UNION
      SELECT s.provider
      FROM agent_sessions s
      WHERE s.organization_id = ${organizationId}
        AND s.developer_id = ${developerId}
        AND s.provider IN ('cursor', 'claude_code')
        AND s.started_at >= ${monthFrom}
    ) x
    WHERE provider IN ('cursor', 'claude_code')
  `);
  const set = new Set<TrackedProvider>();
  for (const row of res.rows) {
    if (row.provider === "cursor" || row.provider === "claude_code") {
      set.add(row.provider);
    }
  }
  return set;
}

type SessionMonthRow = {
  provider: string;
  token_input: string | null;
  token_output: string | null;
  sessions_with_tokens: number;
  model_requests: string | null;
  session_count: number;
};

type TierBRow = {
  completions: string | null;
  chat_requests: string | null;
};

async function cursorAdminMonthlyUsage(
  organizationId: string,
  developerId: string,
  from: Date,
  to: Date,
): Promise<{ completions: number; chatRequests: number } | null> {
  const apiKey = process.env.CURSOR_API_KEY?.trim();
  if (!apiKey) return null;

  const idRes = await db.execute<{ provider_user_id: string }>(sql`
    SELECT metadata->>'provider_user_id' AS provider_user_id
    FROM activity_events
    WHERE organization_id = ${organizationId}
      AND developer_id = ${developerId}
      AND provider = 'cursor'
      AND metadata->>'provider_user_id' IS NOT NULL
    ORDER BY occurred_at DESC
    LIMIT 1
  `);
  const cursorUserId = idRes.rows[0]?.provider_user_id;

  const res = await fetch("https://api.cursor.com/teams/daily-usage-data", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
    },
    body: JSON.stringify({ startDate: from.getTime(), endDate: to.getTime() }),
  });
  if (!res.ok) return null;

  const json = (await res.json()) as {
    data?: Array<{
      userId: number;
      day: string;
      completions?: number;
      chatRequests?: number;
    }>;
  };
  const rows = json.data ?? [];
  const filtered =
    cursorUserId != null
      ? rows.filter((r) => String(r.userId) === cursorUserId)
      : rows;

  if (filtered.length === 0) return null;

  let completions = 0;
  let chatRequests = 0;
  for (const row of filtered) {
    completions += row.completions ?? 0;
    chatRequests += row.chatRequests ?? 0;
  }
  return { completions, chatRequests };
}

function monthlyLimitForProvider(
  config: ProviderPlanConfig | undefined,
  usageUnit: AiUsageUnit,
): number | null {
  if (!config) return null;
  if (usageUnit === "cursor_admin_requests" || usageUnit === "model_requests") {
    const req = config.monthlyRequestBudget;
    if (req != null && req > 0) return req;
  }
  const tok = config.monthlyTokenBudget;
  if (tok != null && tok > 0) return tok;
  return null;
}

function buildProviderRow(input: {
  provider: TrackedProvider;
  periodLabel: string;
  planConfig: ProviderPlanConfig | undefined;
  session: SessionMonthRow | undefined;
  tierB: TierBRow | undefined;
  cursorAdmin: { completions: number; chatRequests: number } | null;
}): EmployeeAiSubscriptionRow {
  const cap = PROVIDER_CAPABILITIES[input.provider];
  const label = cap?.label ?? input.provider;
  const missingTokenTotals = cap?.missing.includes("token_totals") ?? false;
  const planName = input.planConfig?.planName ?? null;

  const sessionTokens =
    input.session && (input.session.sessions_with_tokens ?? 0) > 0
      ? {
          in: Number(input.session.token_input ?? 0),
          out: Number(input.session.token_output ?? 0),
        }
      : null;
  const modelRequests =
    input.session && Number(input.session.model_requests ?? 0) > 0
      ? Number(input.session.model_requests)
      : null;

  const tierBCompletions = input.tierB ? Number(input.tierB.completions ?? 0) : 0;
  const tierBChat = input.tierB ? Number(input.tierB.chat_requests ?? 0) : 0;
  const hasTierB = tierBCompletions > 0 || tierBChat > 0;

  const admin = input.cursorAdmin;
  const hasAdmin = admin != null && (admin.completions > 0 || admin.chatRequests > 0);

  let usageUnit: AiUsageUnit = "tokens";
  let usageSource: EmployeeAiSubscriptionRow["usageSource"] = "none";
  let tokenInput: number | null = null;
  let tokenOutput: number | null = null;
  let tokensUsed: number | null = null;
  let completionsCount: number | null = null;
  let chatRequestsCount: number | null = null;
  let modelReq: number | null = modelRequests;

  if (sessionTokens && !missingTokenTotals) {
    tokenInput = sessionTokens.in;
    tokenOutput = sessionTokens.out;
    tokensUsed = tokenInput + tokenOutput;
    usageUnit = "tokens";
    usageSource = "session_tokens";
  } else if (hasAdmin && input.provider === "cursor") {
    completionsCount = admin!.completions;
    chatRequestsCount = admin!.chatRequests;
    tokensUsed = admin!.completions + admin!.chatRequests;
    usageUnit = "cursor_admin_requests";
    usageSource = "cursor_admin_api";
  } else if (hasTierB && input.provider === "cursor") {
    completionsCount = tierBCompletions;
    chatRequestsCount = tierBChat;
    tokensUsed = tierBCompletions + tierBChat;
    usageUnit = "cursor_admin_requests";
    usageSource = "tier_b_pull";
  } else if (modelRequests != null && modelRequests > 0) {
    tokensUsed = modelRequests;
    usageUnit = "model_requests";
    usageSource = "session_model_requests";
  } else if (
    input.session &&
    (input.session.session_count ?? 0) > 0 &&
    missingTokenTotals
  ) {
    tokensUsed = 0;
    modelReq = Number(input.session.model_requests ?? 0);
    usageUnit = "model_requests";
    usageSource = "session_model_requests";
  } else if (sessionTokens && missingTokenTotals) {
    // Claude with partial token data only — still show tokens.
    tokenInput = sessionTokens.in;
    tokenOutput = sessionTokens.out;
    tokensUsed = tokenInput + tokenOutput;
    usageUnit = "tokens";
    usageSource = "session_tokens";
  } else if (
    input.session &&
    (input.session.session_count ?? 0) > 0 &&
    !missingTokenTotals
  ) {
    tokenInput = 0;
    tokenOutput = 0;
    tokensUsed = 0;
    usageUnit = "tokens";
    usageSource = "session_tokens";
  }

  const monthlyLimit = monthlyLimitForProvider(input.planConfig, usageUnit);
  const limitConfigured = monthlyLimit != null && monthlyLimit > 0;

  let remaining: number | null = null;
  if (limitConfigured && tokensUsed != null) {
    remaining = Math.max(0, monthlyLimit! - tokensUsed);
  }

  const tokensFromTelemetry =
    usageSource !== "none" &&
    (usageSource !== "session_tokens" || tokensUsed != null);

  return {
    provider: input.provider,
    label,
    periodLabel: input.periodLabel,
    planName,
    usageUnit,
    tokenInput,
    tokenOutput,
    tokensUsed,
    modelRequests: modelReq,
    completionsCount,
    chatRequestsCount,
    monthlyLimit: limitConfigured ? monthlyLimit : null,
    remaining,
    tokensFromTelemetry,
    limitConfigured,
    usageSource,
  };
}

export async function employeeAiSubscriptions(
  organizationId: string,
  developerId: string,
): Promise<EmployeeAiSubscriptionRow[]> {
  try {
    return await employeeAiSubscriptionsInner(organizationId, developerId);
  } catch (err) {
    console.error("[employeeAiSubscriptions]", err);
    return [];
  }
}

async function employeeAiSubscriptionsInner(
  organizationId: string,
  developerId: string,
): Promise<EmployeeAiSubscriptionRow[]> {
  const [limits, monthBounds] = await Promise.all([
    getOrgAiPlanLimits(organizationId),
    currentCalendarMonthBounds(),
  ]);

  const presence = await employeeAiProviderPresence(
    organizationId,
    developerId,
    monthBounds.from,
  );
  if (presence.size === 0) return [];

  const providers = TRACKED_PROVIDERS.filter((p) => presence.has(p));

  const usageRes = await db.execute<SessionMonthRow>(sql`
    SELECT s.provider,
           SUM(s.token_input)  AS token_input,
           SUM(s.token_output) AS token_output,
           COUNT(*) FILTER (WHERE s.token_input IS NOT NULL OR s.token_output IS NOT NULL)::int
             AS sessions_with_tokens,
           SUM(s.model_requests)::bigint AS model_requests,
           COUNT(*)::int AS session_count
    FROM agent_sessions s
    WHERE s.organization_id = ${organizationId}
      AND s.developer_id = ${developerId}
      AND s.provider IN (${sql.join(
        providers.map((p) => sql`${p}`),
        sql`, `,
      )})
      AND s.started_at >= ${monthBounds.from}
      AND s.started_at < ${monthBounds.to}
    GROUP BY s.provider
  `);

  const usageByProvider = new Map(usageRes.rows.map((r) => [r.provider, r]));

  let tierBByProvider = new Map<string, TierBRow>();
  if (presence.has("cursor")) {
    const tierRes = await db.execute<TierBRow>(sql`
      SELECT
        COALESCE(SUM((e.metadata->>'completions_count')::bigint), 0)::text AS completions,
        COALESCE(SUM((e.metadata->>'chat_requests_count')::bigint), 0)::text AS chat_requests
      FROM activity_events e
      WHERE e.organization_id = ${organizationId}
        AND e.developer_id = ${developerId}
        AND e.provider = 'cursor'
        AND e.event_type = 'provider_daily_aggregate'
        AND e.occurred_at >= ${monthBounds.from}
        AND e.occurred_at < ${monthBounds.to}
    `);
    if (tierRes.rows[0]) {
      tierBByProvider.set("cursor", tierRes.rows[0]);
    }
  }

  const cursorAdmin =
    presence.has("cursor")
      ? await cursorAdminMonthlyUsage(
          organizationId,
          developerId,
          monthBounds.from,
          monthBounds.to,
        )
      : null;

  return providers.map((provider) =>
    buildProviderRow({
      provider,
      periodLabel: monthBounds.label,
      planConfig: limits[provider],
      session: usageByProvider.get(provider),
      tierB: tierBByProvider.get(provider),
      cursorAdmin: provider === "cursor" ? cursorAdmin : null,
    }),
  );
}
