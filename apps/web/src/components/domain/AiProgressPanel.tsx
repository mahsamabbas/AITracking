"use client";

import Link from "next/link";
import { Bar, BarChart, CartesianGrid, Legend, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { InfoDot } from "@/components/ui/InfoDot";
import { EmptyState } from "@/components/ui/States";
import { AXIS, ChartFrame, GRID, TooltipShell } from "@/components/charts/ChartFrame";
import { formatDate, formatDuration, formatNumber, formatRelative } from "@/lib/format";
import { providerMeta } from "@/lib/providers";
import { useChartAnimation } from "@/lib/use-reduced-motion";
import type { AiProgress, ProviderProgress, TierBDay } from "@/lib/types";

/**
 * AI Progress — the centre of the employee hub. One card per AI tool with what
 * the agent performed, what the provider cannot report, and where the
 * capability statement comes from (live connector report or static catalog).
 * All numbers are from GET /v1/employees/:id → aiProgress.
 */
export function AiProgressPanel({
  progress,
  employeeId,
  emptyVariant,
}: {
  progress: AiProgress | undefined;
  employeeId: string;
  emptyVariant: "no-activity" | "connector-offline" | "paused";
}) {
  if (!progress || progress.providers.length === 0) {
    return (
      <Card>
        <CardHeader title="AI progress" subtitle="What each connected AI tool performed in this range" />
        <EmptyState compact variant={emptyVariant} />
      </Card>
    );
  }

  const { coverage } = progress;
  const sessionProviders = progress.providers.filter((p) => p.sessions > 0);
  const tierBProviders = [...new Set(progress.tierBDaily.map((d) => d.provider))];

  return (
    <Card>
      <CardHeader
        title="AI progress"
        subtitle="What each connected AI tool performed — open a tool for its sessions and details"
        action={
          coverage.observedPct != null ? (
            <span className="flex items-center gap-1.5 text-xs text-ink-500">
              Observed {coverage.observedPct}%
              <InfoDot
                text={`Observed session time vs time inside coverage gaps (pauses, stale connector). ${coverage.gapCount} gap${coverage.gapCount === 1 ? "" : "s"} totalling ${formatDuration(coverage.gapMs)}. Gaps are unknown time, not idle time.`}
              />
            </span>
          ) : null
        }
      />
      <CardBody className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-2">
          {sessionProviders.map((p) => (
            <ProviderProgressCard key={p.provider} p={p} employeeId={employeeId} />
          ))}
        </div>
        {tierBProviders.map((provider) => (
          <TierBDailyChart
            key={provider}
            provider={provider}
            days={progress.tierBDaily.filter((d) => d.provider === provider)}
            employeeId={employeeId}
          />
        ))}
      </CardBody>
    </Card>
  );
}

function Stat({
  label,
  value,
  unavailable,
  help,
}: {
  label: string;
  value: string;
  unavailable?: boolean;
  help?: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1 text-2xs text-ink-500">
        {label}
        {help ? <InfoDot text={help} /> : null}
      </dt>
      <dd className={unavailable ? "mt-0.5 text-xs text-ink-400" : "num mt-0.5 text-sm font-semibold text-ink-900"}>
        {value}
      </dd>
    </div>
  );
}

function ProviderProgressCard({ p, employeeId }: { p: ProviderProgress; employeeId: string }) {
  const meta = providerMeta(p.provider);
  const noTokens = p.capability.missing.includes("token_totals") || p.tokenInput == null;
  const turnTiming = p.capability.missing.includes("model_call_timing");
  const failures = p.testsFailed + p.buildsFailed;

  return (
    <div className="card-interactive flex flex-col p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className="provider-badge flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold"
                  style={{ "--provider-bg": meta.soft, "--provider-fg": meta.ink, "--provider-dot": meta.color } as React.CSSProperties}
          >
            {meta.label.slice(0, 2).toUpperCase()}
          </span>
          <div>
            <p className="text-sm font-semibold text-ink-900">{p.label}</p>
            <p className="hint">
              {p.sharePct}% of AI time · last activity {formatRelative(p.lastActivityAt)}
            </p>
          </div>
        </div>

      </div>

      <dl className="mt-4 grid grid-cols-3 gap-x-3 gap-y-3">
        <Stat label="Sessions" value={formatNumber(p.sessions)} />
        <Stat
          label="Agent active"
          value={formatDuration(p.activeMs)}
          help="Merged model + tool execution time; parallel operations counted once."
        />
        <Stat
          label={turnTiming ? "Agent turns" : "Model calls"}
          value={formatNumber(p.modelRequests)}
          help={
            turnTiming
              ? "This provider's hooks mark a prompt and the agent stopping — one count per turn, and its duration spans the whole turn including tools."
              : "One count per model API call, with its own measured duration."
          }
        />
        <Stat label="Tool calls" value={formatNumber(p.toolCalls)} />
        <Stat label="File changes" value={formatNumber(p.fileChanges)} />
        {/* Only what the agent actually reported: no placeholders for data a provider does not send. */}
        {p.testsRun + p.buildsRun > 0 ? (
          <Stat
            label="Tests · builds"
            value={`${p.testsRun} · ${p.buildsRun}${failures ? ` (${failures} failed)` : ""}`}
          />
        ) : null}
        {noTokens ? null : (
          <Stat label="Tokens in / out" value={`${formatNumber(p.tokenInput)} / ${formatNumber(p.tokenOutput)}`} />
        )}
        {p.models.length ? (
          <div className="col-span-2 min-w-0">
            <dt className="text-2xs text-ink-500">Models</dt>
            <dd className="mt-0.5 truncate text-xs text-ink-700">{p.models.map((m) => m.model).join(", ")}</dd>
          </div>
        ) : null}
      </dl>

      <Link
        href={`/employees/${employeeId}/tools/${p.provider}`}
        className="mt-3 text-xs font-medium text-brand-600 hover:text-brand-700"
      >
        {p.label} sessions and details →
      </Link>
    </div>
  );
}

const TIER_B_SERIES: { key: keyof TierBDay; label: string; color: string }[] = [
  { key: "billableRequests", label: "Billable requests", color: "var(--chart-1)" },
  { key: "chatRequests", label: "Chat requests", color: "var(--chart-2)" },
  { key: "agentRequests", label: "Agent requests", color: "var(--chart-5)" },
  { key: "completions", label: "Accepted completions", color: "var(--chart-3)" },
  { key: "suggestions", label: "Suggestions", color: "var(--chart-6)" },
  { key: "acceptances", label: "Acceptances", color: "var(--chart-2)" },
];

/** Tier B providers report per day — shown as daily bars, never as sessions. */
function TierBDailyChart({
  provider,
  days,
  employeeId,
}: {
  provider: string;
  days: TierBDay[];
  employeeId: string;
}) {
  const anim = useChartAnimation();
  const meta = providerMeta(provider);
  // Only series the provider actually reported (never draw a null as 0).
  const series = TIER_B_SERIES.filter((s) => days.some((d) => d[s.key] != null));
  return (
    <div className="rounded-lg border border-line p-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-ink-900">
          {meta.label} <span className="hint font-normal">· daily report (Tier B)</span>
        </p>
        <Link href={`/employees/${employeeId}/tools/${provider}`} className="text-xs font-medium text-brand-600">
          Details →
        </Link>
      </div>
      {series.length === 0 ? (
        <EmptyState compact variant="provider-missing" />
      ) : (
        <ChartFrame height={200}>
          <BarChart data={days} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="date" {...AXIS} tickFormatter={(v: string) => formatDate(v)} minTickGap={16} />
            <YAxis {...AXIS} width={40} allowDecimals={false} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Tooltip
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <TooltipShell
                    title={formatDate(String(label))}
                    rows={series.map((s) => {
                      const v = (payload[0]?.payload as TierBDay)[s.key];
                      return { label: s.label, value: v == null ? "Not reported" : formatNumber(Number(v)), color: s.color };
                    })}
                  />
                ) : null
              }
            />
            {series.map((s) => (
              <Bar key={s.key} {...anim} dataKey={s.key} name={s.label} fill={s.color} radius={[2, 2, 0, 0]} />
            ))}
          </BarChart>
        </ChartFrame>
      )}
      <p className="hint mt-2">
        Reported once a day by {meta.label}&apos;s organisation API and attributed by account email or
        a mapped login. There are no hourly or session figures for this source.
      </p>
    </div>
  );
}
