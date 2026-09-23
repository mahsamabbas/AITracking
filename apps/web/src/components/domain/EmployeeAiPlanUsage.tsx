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
      label: "Agent turns (prompt → stop)",
      value: formatTokens(row.tokensUsed),
      missing: false,
    };
  }
  if (unit === "cursor_admin_requests") {
    return {
      label: "Chat requests (Cursor daily report)",
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
  if (unit === "tokens") return "Token limit (admin-configured)";
  return "Request limit (admin-configured)";
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
            : "Calendar-month usage exactly as each provider reports it. Limits appear only when an administrator configures them."
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
                  className="provider-badge flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold"
                  style={{ "--provider-bg": meta.soft, "--provider-fg": meta.ink, "--provider-dot": meta.color } as React.CSSProperties}
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
                      <span className="hint font-sans font-normal">
                        {(row.sessionsThisMonth ?? 0) > 0
                          ? `Not reported by provider · ${row.sessionsThisMonth} sessions observed`
                          : "No activity yet this month"}
                      </span>
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
                    <dt className="text-ink-400">Observed by connector hooks</dt>
                    <dd className="num text-ink-600">{formatTokens(row.modelRequests)}</dd>
                  </div>
                ) : null}
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-500">{limitLabel(row)}</dt>
                  <dd className="num font-medium text-ink-900">
                    {row.monthlyLimit != null ? (
                      `${formatTokens(row.monthlyLimit)} / month`
                    ) : (
                      <span className="hint font-sans font-normal">No limit configured</span>
                    )}
                  </dd>
                </div>
                {row.remaining != null ? (
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-500">Remaining</dt>
                    <dd className="num font-medium text-ink-900">{formatTokens(row.remaining)}</dd>
                  </div>
                ) : null}
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

              {row.provider === "cursor" && headline.missing && !(row.sessionsThisMonth > 0) ? (
                <p className="hint mt-3 text-xs leading-relaxed">
                  Nothing has been reported for Cursor this month. Session activity appears once the
                  connector observes Cursor agent hooks; daily request counts appear only when the
                  organisation&apos;s Cursor Admin API puller is configured and this person&apos;s Cursor
                  email matches their directory email.
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
