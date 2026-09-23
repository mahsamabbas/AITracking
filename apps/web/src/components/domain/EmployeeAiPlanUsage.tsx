"use client";

import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { formatNumber } from "@/lib/format";
import { providerMeta } from "@/lib/providers";
import type { EmployeeAiSubscription } from "@/lib/types";

function formatTokens(n: number | null | undefined): string {
  if (n == null) return "—";
  return formatNumber(n);
}

function usageHeadline(row: EmployeeAiSubscription): {
  label: string;
  value: string;
  missing: boolean;
} {
  const unit = row.usageUnit ?? "tokens";
  if (row.tokensUsed == null && !row.tokensFromTelemetry) {
    return { label: "Usage this month", value: "", missing: true };
  }
  if (unit === "model_requests") {
    return {
      label: "Agent model requests",
      value: formatTokens(row.tokensUsed),
      missing: false,
    };
  }
  if (unit === "cursor_admin_requests") {
    return {
      label: "Billing requests (completions + chat)",
      value: formatTokens(row.tokensUsed),
      missing: false,
    };
  }
  return {
    label: "Tokens used (in + out)",
    value: formatTokens(row.tokensUsed),
    missing: false,
  };
}

function limitLabel(row: EmployeeAiSubscription): string {
  const unit = row.usageUnit ?? "tokens";
  if (unit === "model_requests") return "Included requests / month (org config)";
  if (unit === "cursor_admin_requests") return "Included requests / month";
  return "Plan limit";
}

export function EmployeeAiPlanUsage({
  rows,
  isSelf,
}: {
  rows: EmployeeAiSubscription[];
  isSelf?: boolean;
}) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader
          title="AI subscription usage"
          subtitle={
            isSelf
              ? "Install the connector and use Cursor or Claude Code on this machine to see usage here."
              : "No Cursor or Claude Code connector activity for this person yet."
          }
        />
        <CardBody>
          <p className="hint text-sm">
            Cards appear only for tools with a registered connector or sessions this calendar month.
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="AI subscription usage"
        subtitle={
          isSelf
            ? "Calendar-month usage from your connector and, for Cursor teams, the Admin API when configured."
            : "Calendar-month usage from the connector vs organisation plan limits."
        }
      />
      <CardBody className="grid gap-4 sm:grid-cols-2">
        {rows.map((row) => {
          const meta = providerMeta(row.provider);
          const headline = usageHeadline(row);
          const usedPct =
            row.monthlyLimit && row.tokensUsed != null && row.monthlyLimit > 0
              ? Math.min(100, Math.round((row.tokensUsed / row.monthlyLimit) * 100))
              : null;

          return (
            <div
              key={row.provider}
              className="rounded-lg border border-line bg-slate-50/50 p-4 dark:bg-white/[0.03]"
            >
              <div className="flex items-center gap-2">
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold"
                  style={{ background: meta.soft, color: meta.ink }}
                >
                  {meta.label.slice(0, 2).toUpperCase()}
                </span>
                <div>
                  <p className="text-sm font-semibold text-ink-900">{row.label}</p>
                  <p className="hint">
                    {row.planName ? `${row.planName} · ` : ""}
                    {row.periodLabel}
                  </p>
                </div>
              </div>

              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-500">{headline.label}</dt>
                  <dd className="num font-medium text-ink-900">
                    {headline.missing ? (
                      <span className="hint font-sans font-normal">No activity yet this month</span>
                    ) : (
                      headline.value
                    )}
                  </dd>
                </div>
                {row.completionsCount != null || row.chatRequestsCount != null ? (
                  <div className="flex justify-between gap-3 text-xs">
                    <dt className="text-ink-400">Completions / chat requests</dt>
                    <dd className="num text-ink-600">
                      {formatTokens(row.completionsCount)} / {formatTokens(row.chatRequestsCount)}
                    </dd>
                  </div>
                ) : null}
                {row.tokenInput != null && row.usageUnit === "tokens" ? (
                  <div className="flex justify-between gap-3 text-xs">
                    <dt className="text-ink-400">Input / output</dt>
                    <dd className="num text-ink-600">
                      {formatTokens(row.tokenInput)} / {formatTokens(row.tokenOutput)}
                    </dd>
                  </div>
                ) : null}
                {row.modelRequests != null && row.usageUnit === "model_requests" ? (
                  <div className="flex justify-between gap-3 text-xs">
                    <dt className="text-ink-400">From agent sessions</dt>
                    <dd className="num text-ink-600">{formatTokens(row.modelRequests)}</dd>
                  </div>
                ) : null}
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-500">{limitLabel(row)}</dt>
                  <dd className="num font-medium text-ink-900">
                    {row.monthlyLimit != null
                      ? `${formatTokens(row.monthlyLimit)} / month`
                      : "Not configured"}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-500">Remaining</dt>
                  <dd className="num font-medium text-ink-900">
                    {row.remaining != null ? formatTokens(row.remaining) : "—"}
                  </dd>
                </div>
              </dl>

              {usedPct != null ? (
                <div className="mt-3">
                  <div className="flex justify-between text-2xs text-ink-500">
                    <span>Of monthly budget</span>
                    <span className="num">{usedPct}%</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                    <div
                      className="h-full rounded-full bg-brand-500"
                      style={{ width: `${Math.max(usedPct > 0 ? 2 : 0, usedPct)}%` }}
                    />
                  </div>
                </div>
              ) : null}

              {row.provider === "cursor" && headline.missing ? (
                <p className="hint mt-3 text-xs leading-relaxed">
                  Use the agent in Cursor with the connector running. For team billing totals matching
                  cursor.com, set <span className="font-mono text-2xs">CURSOR_API_KEY</span> on the API
                  and run the worker puller, or ask an admin to mirror your plan under organisation AI
                  limits.
                </p>
              ) : null}
              {row.provider === "cursor" && row.usageSource === "session_model_requests" ? (
                <p className="hint mt-3 text-xs leading-relaxed">
                  Cursor hooks report agent activity, not token totals. Request counts come from observed
                  model requests; compare with your Cursor account usage page for subscription consumption.
                </p>
              ) : null}
            </div>
          );
        })}
      </CardBody>
    </Card>
  );
}
