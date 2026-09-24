import { sql } from "drizzle-orm";
import { db } from "./db.js";
import { PROVIDER_CAPABILITIES } from "@techlio/event-schema";
import { timezoneFromEnv } from "./timezone.js";

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
  /** Sessions observed this month — lets the UI tell "no activity" from "not reported". */
  sessionsThisMonth: number;
  usageSource: "session_tokens" | "session_model_requests" | "tier_b_pull" | "none";
}

/**
 * Plan limits exist only when an administrator configures them (organizations.
 * ai_plan_limits, or TECHLIO_DEFAULT_AI_PLAN_LIMITS). There is no built-in
 * budget: an unconfigured plan shows usage with no limit and no "remaining".
 */
function defaultLimits(): AiPlanLimits {
  const raw = process.env.TECHLIO_DEFAULT_AI_PLAN_LIMITS;
  if (raw) {
    try {
      return JSON.parse(raw) as AiPlanLimits;
    } catch {
      /* ignore malformed override */
    }
  }
  return {};
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
    const tz = timezoneFromEnv();
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
        AND d.revoked_at IS NULL AND d.kind = 'connector'
      UNION
      SELECT s.provider
      FROM agent_sessions s
      WHERE s.organization_id = ${organizationId}
        AND s.developer_id = ${developerId}
        AND s.provider IN ('cursor', 'claude_code')
        AND s.started_at >= ${monthFrom}
      UNION
      SELECT e.payload->>'provider'
      FROM activity_events e
      WHERE e.organization_id = ${organizationId}
        AND e.developer_id = ${developerId}
        AND e.event_type = 'provider_daily_aggregate'
        AND e.occurred_at >= ${monthFrom}
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
  billable_requests: string | null;
};

/** A limit is only compared against usage in the same unit. */
function monthlyLimitForProvider(
  config: ProviderPlanConfig | undefined,
  usageUnit: AiUsageUnit,
): number | null {
  if (!config) return null;
  const value =
    usageUnit === "tokens" ? config.monthlyTokenBudget : config.monthlyRequestBudget;
  return value != null && value > 0 ? value : null;
}

export function buildProviderRow(input: {
  provider: TrackedProvider;
  periodLabel: string;
  planConfig: ProviderPlanConfig | undefined;
  session: SessionMonthRow | undefined;
  tierB: TierBRow | undefined;
}): EmployeeAiSubscriptionRow {
  const cap = PROVIDER_CAPABILITIES[input.provider];
  const label = cap?.label ?? input.provider;
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
  const tierBChat = input.tierB?.chat_requests != null ? Number(input.tierB.chat_requests) : null;
  const tierBCompletions =
    input.tierB?.completions != null ? Number(input.tierB.completions) : null;
  const tierBBillable =
    input.tierB?.billable_requests != null ? Number(input.tierB.billable_requests) : null;
  const hasTierB = tierBBillable != null || tierBChat != null || tierBCompletions != null;

  // Each branch reports only what a source actually measured. A source that
  // reported nothing yields null ("not reported"), never a 0.
  let usageUnit: AiUsageUnit = "tokens";
  let usageSource: EmployeeAiSubscriptionRow["usageSource"] = "none";
  let tokenInput: number | null = null;
  let tokenOutput: number | null = null;
  let tokensUsed: number | null = null;
  let completionsCount: number | null = null;
  let chatRequestsCount: number | null = null;

  if (sessionTokens) {
    tokenInput = sessionTokens.in;
    tokenOutput = sessionTokens.out;
    tokensUsed = tokenInput + tokenOutput;
    usageUnit = "tokens";
    usageSource = "session_tokens";
  } else if (hasTierB && input.provider === "cursor") {
    // Cursor's daily report counts chat requests and tab completions
    // separately. They are different units, so they are never summed.
    // Headline is the billable request count Cursor reports against the plan
    // (the figure shown on cursor.com); chat requests and accepted tab
    // completions are shown alongside, never summed into it.
    chatRequestsCount = tierBChat;
    completionsCount = tierBCompletions;
    tokensUsed = tierBBillable;
    usageUnit = "cursor_admin_requests";
    usageSource = "tier_b_pull";
  } else if (modelRequests != null) {
    tokensUsed = modelRequests;
    usageUnit = "model_requests";
    usageSource = "session_model_requests";
  }

  const monthlyLimit = monthlyLimitForProvider(input.planConfig, usageUnit);
  const limitConfigured = monthlyLimit != null;
  const remaining =
    limitConfigured && tokensUsed != null ? Math.max(0, monthlyLimit - tokensUsed) : null;

  return {
    provider: input.provider,
    label,
    periodLabel: input.periodLabel,
    planName,
    usageUnit,
    tokenInput,
    tokenOutput,
    tokensUsed,
    modelRequests,
    completionsCount,
    chatRequestsCount,
    monthlyLimit,
    remaining,
    tokensFromTelemetry: usageSource !== "none",
    limitConfigured,
    sessionsThisMonth: input.session?.session_count ?? 0,
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

  const tierBByProvider = new Map<string, TierBRow>();
  if (presence.has("cursor")) {
    const tierRes = await db.execute<TierBRow>(sql`
      SELECT
        SUM((e.payload->'metadata'->>'completions_count')::bigint)::text AS completions,
        SUM((e.payload->'metadata'->>'chat_requests_count')::bigint)::text AS chat_requests,
        SUM((e.payload->'metadata'->>'billable_requests_count')::bigint)::text AS billable_requests
      FROM activity_events e
      WHERE e.organization_id = ${organizationId}
        AND e.developer_id = ${developerId}
        AND e.payload->>'provider' = 'cursor'
        AND e.event_type = 'provider_daily_aggregate'
        AND e.occurred_at >= ${monthBounds.from}
        AND e.occurred_at < ${monthBounds.to}
    `);
    if (tierRes.rows[0]) {
      tierBByProvider.set("cursor", tierRes.rows[0]);
    }
  }

  return providers.map((provider) =>
    buildProviderRow({
      provider,
      periodLabel: monthBounds.label,
      planConfig: limits[provider],
      session: usageByProvider.get(provider),
      tierB: tierBByProvider.get(provider),
    }),
  );
}
