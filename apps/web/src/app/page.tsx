"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { TableScroll } from "@/components/ui/TableScroll";
import { StatTile } from "@/components/ui/StatTile";
import { Callout } from "@/components/ui/Callout";
import {
  ChartSkeleton,
  EmptyState,
  emptyActivityVariant,
  ErrorState,
  StatSkeleton,
} from "@/components/ui/States";
import { TrendChart } from "@/components/charts/TrendChart";
import { HourPatternChart } from "@/components/charts/HourPatternChart";
import { DonutChart } from "@/components/charts/DonutChart";
import { BarList } from "@/components/charts/BarList";
import { AlertList } from "@/components/domain/AlertList";
import { ConnectorBadge, ProviderBadge } from "@/components/domain/Badges";
import { DurationSplit } from "@/components/domain/DurationSplit";
import { FilterBar, SelectFilter } from "@/components/filters/FilterBar";
import { ContextBar } from "@/components/ui/ContextBar";
import {
  RangePicker,
  rangeLabel,
  rangeParams,
  type RangeValue,
} from "@/components/filters/RangePicker";
import { useApi } from "@/lib/use-api";
import { useAuth } from "@/lib/auth-context";
import { API_BASE, apiPost, qs } from "@/lib/api";
import { formatDuration, formatNumber, formatRelative } from "@/lib/format";
import { providerLabel } from "@/lib/providers";
import { classificationOf, TOOL_CATEGORY_LABEL } from "@/lib/vocab";
import { canExportActivity, canViewTeam } from "@/lib/permissions";
import type {
  FilterMeta,
  LiveStatus,
  OrganizationAnalytics,
} from "@/lib/types";

export default function OverviewPage() {
  const { user, token } = useAuth();
  const [range, setRange] = useState<RangeValue>({ preset: "7d" });
  const [team, setTeam] = useState("");
  const [provider, setProvider] = useState("");
  const [exporting, setExporting] = useState<"csv" | "pdf" | null>(null);

  async function downloadExport(format: "csv" | "pdf") {
    if (!token) return;
    setExporting(format);
    try {
      const created = await apiPost<{ downloadUrl: string }>("/v1/activity-exports", token, {
        format,
        preset: range.preset === "custom" ? undefined : range.preset,
        from: range.preset === "custom" && range.from ? new Date(range.from).toISOString() : undefined,
        to:
          range.preset === "custom" && range.to
            ? new Date(new Date(range.to).getTime() + 86_400_000).toISOString()
            : undefined,
      });
      const response = await fetch(`${API_BASE}${created.downloadUrl}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Export download failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `activity-summary.${format}`;
      anchor.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(null);
    }
  }

  const isSelfScope = user?.role === "developer";
  const params = { ...rangeParams(range), team: team || undefined, provider: provider || undefined };

  const analytics = useApi<OrganizationAnalytics>(
    `/v1/analytics/organization${qs(params)}`,
  );
  const live = useApi<LiveStatus>("/v1/dashboard/live?limit=8", { pollMs: 30_000 });
  const meta = useApi<FilterMeta>("/v1/meta/filters");

  const d = analytics.data;
  const t = d?.totals;
  const prev = d?.previousTotals;

  const toolItems = useMemo(
    () =>
      (d?.tools ?? []).map((tool) => ({
        label: providerLabel(tool.provider),
        value: tool.activeMs,
        formatted: formatDuration(tool.activeMs),
        meta: `${tool.sessions} sessions · ${tool.employees} employees · last used ${formatRelative(tool.lastUsedAt)}`,
      })),
    [d?.tools],
  );

  const classificationSlices = useMemo(
    () =>
      (d?.classifications ?? []).map((c) => {
        const info = classificationOf(c.classification);
        return {
          name: info.label,
          value: c.sessions,
          formatted: `${c.sessions}`,
          color: info.productive
            ? c.classification === "engineering_output"
              ? "var(--chart-2)"
              : c.classification === "assisted_editing"
                ? "var(--chart-1)"
                : "var(--chart-6)"
            : "var(--chart-idle)",
        };
      }),
    [d?.classifications],
  );

  const hasActivity = (t?.sessions ?? 0) > 0;
  const liveConnectors = live.data?.connectors ?? [];
  const emptyVariant = emptyActivityVariant(liveConnectors);
  const coverage = d?.coverage;
  const coverageIssues =
    (coverage?.staleConnectors ?? 0) +
    (coverage?.offlineConnectors ?? 0) +
    (coverage?.pausedConnectors ?? 0);

  return (
    <AppShell
      title={isSelfScope ? "Your AI activity" : "Organisation overview"}
      subtitle={
        isSelfScope
          ? "Everything collected about you through your connected AI tools."
          : `How AI coding tools are being used across Techlio · ${rangeLabel(range)}`
      }
      actions={
        canViewTeam(user?.role) ? (
          <div className="flex flex-wrap items-center gap-2">
            {canExportActivity(user?.role) ? (
              <>
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={exporting !== null}
                  onClick={() => void downloadExport("csv")}
                >
                  {exporting === "csv" ? "Exporting…" : "Export CSV"}
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={exporting !== null}
                  onClick={() => void downloadExport("pdf")}
                >
                  {exporting === "pdf" ? "Exporting…" : "Export PDF"}
                </button>
              </>
            ) : null}
            <Link href="/employees" className="btn-primary">
              Employee directory
            </Link>
          </div>
        ) : null
      }
    >
      <ContextBar
        subject={isSelfScope ? user?.displayName ?? "You" : "Organisation"}
        rangeLabel={rangeLabel(range)}
        fetchedAt={analytics.fetchedAt}
        live={Boolean(live.data?.generatedAt)}
        refreshing={analytics.refreshing || live.refreshing}
        onRefresh={() => {
          analytics.reload();
          live.reload();
        }}
      />
      <FilterBar>
        <RangePicker value={range} onChange={setRange} />
        {canViewTeam(user?.role) ? (
          <>
            <SelectFilter
              label="Team"
              value={team}
              onChange={setTeam}
              allLabel="All teams"
              options={(meta.data?.teams ?? []).map((x) => ({ value: x, label: x }))}
            />
            <SelectFilter
              label="AI tool"
              value={provider}
              onChange={setProvider}
              allLabel="All AI tools"
              width="w-[170px]"
              options={(meta.data?.providers ?? []).map((p) => ({
                value: p.id,
                label: p.label,
              }))}
            />
          </>
        ) : null}
      </FilterBar>

      {live.data?.dbAvailable === false ? (
        <div className="mb-5">
          <Callout tone="bad" title="Database not reachable">
            {live.data.hint}
          </Callout>
        </div>
      ) : null}

      {analytics.error ? (
        <Card>
          <ErrorState
            title="Could not load organisation analytics"
            detail={analytics.error}
            onRetry={analytics.reload}
          />
        </Card>
      ) : analytics.loading ? (
        <>
          <StatSkeleton />
          <div className="mt-5 card">
            <ChartSkeleton height={260} />
          </div>
        </>
      ) : !hasActivity ? (
        <>
          {liveConnectors.length > 0 ? (
            <Card className="mb-5">
              <div className="flex flex-wrap items-center gap-3 p-5">
                {liveConnectors.map((c) => (
                  <span key={c.deviceId} className="flex items-center gap-1.5">
                    <ConnectorBadge state={c.state} />
                    <ProviderBadge provider={c.provider} size="sm" />
                    <span className="hint">{formatRelative(c.lastHeartbeat)}</span>
                  </span>
                ))}
              </div>
            </Card>
          ) : null}
          <Card>
            <EmptyState
              variant={emptyVariant}
              action={
                <button type="button" className="btn-ghost" onClick={() => setRange({ preset: "30d" })}>
                  Widen to 30 days
                </button>
              }
            />
          </Card>
        </>
      ) : (
        <>
          {/* ---------------- KPI row ---------------- */}
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Key metrics">
            <StatTile
              label="AI active time"
              value={formatDuration(t!.activeMs, { compact: true })}
              hint="vs previous period"
              accent="brand"
              current={t!.activeMs}
              previous={prev!.activeMs}
              help="Merged model and tool execution time. Overlapping operations are counted once, and this is not the same as a person's working time."
            />
            <StatTile
              label="Sessions"
              value={formatNumber(t!.sessions)}
              hint={`avg ${formatDuration(t!.avgSessionMs)} active`}
              accent="teal"
              current={t!.sessions}
              previous={prev!.sessions}
              help="Agent sessions that started in this period."
            />
            <StatTile
              label={isSelfScope ? "Tools connected" : "Employees with activity"}
              value={
                isSelfScope
                  ? String(d!.tools.length)
                  : `${t!.activeEmployees} / ${d!.headcount.total}`
              }
              hint={
                isSelfScope
                  ? "AI tools you used"
                  : `${d!.headcount.connected} have a registered connector`
              }
              accent="slate"
              help="Employees with at least one observed agent session in this period."
            />
            <StatTile
              label="Coverage warnings"
              value={formatNumber(coverageIssues + (coverage?.employeesWithoutTelemetry ?? 0))}
              hint="gaps, pauses, silent connectors"
              accent={coverageIssues > 0 ? "amber" : "slate"}
              invertDelta
              help="Telemetry limitations. A coverage gap means the system cannot confirm what happened — it never means the person was idle."
            />
          </section>

          {/* ---------------- Trend + split ---------------- */}
          <section className="mt-5 grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader
                title="AI usage over time"
                subtitle="Agent active time and in-session idle time, per day"
              />
              <CardBody className="pt-2">
                <TrendChart data={d!.dailyTrend} />
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Observed time split"
                subtitle="Never presented as a single number"
              />
              <CardBody>
                <DurationSplit
                  totalMs={t!.elapsedMs}
                  totalLabel="Total session span observed"
                  bands={[
                    {
                      label: "Productive agent activity",
                      ms: t!.productiveMs,
                      color: "var(--chart-2)",
                      help: "Merged model and tool time in sessions that produced file changes, tests, builds, or exploration work.",
                    },
                    {
                      label: "Other agent activity",
                      ms: Math.max(0, t!.activeMs - t!.productiveMs),
                      color: "var(--chart-1)",
                      help: "Agent operations in sessions dominated by idle time.",
                    },
                    {
                      label: "In-session idle",
                      ms: t!.idleMs,
                      color: "var(--chart-idle)",
                      help: "Gaps over 10 minutes inside a session. The person may have been working without the agent — this is not non-work.",
                    },
                    {
                      label: "Session, agent not running",
                      ms: Math.max(0, t!.elapsedMs - t!.activeMs - t!.idleMs),
                      color: "var(--chart-muted)",
                      help: "Time inside the interactive session with no model or tool operation executing — reading, typing, reviewing.",
                    },
                  ]}
                />
              </CardBody>
            </Card>
          </section>

          {/* ---------------- Tools ---------------- */}
          <section className="mt-5 grid gap-4 xl:grid-cols-3">
            <Card>
              <CardHeader title="AI tools in use" subtitle="By agent active time" />
              <CardBody>
                <BarList items={toolItems} />
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Session activity mix"
                subtitle="What the agent was observed doing"
              />
              <CardBody>
                <DonutChart
                  data={classificationSlices}
                  centerValue={formatNumber(t!.sessions)}
                  centerLabel="sessions"
                />
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Working-hour pattern"
                subtitle="When agent activity happens (org timezone)"
              />
              <CardBody className="pt-2">
                <HourPatternChart data={d!.hourPattern} />
              </CardBody>
            </Card>
          </section>

          {/* ---------------- Teams / categories / outcomes ---------------- */}
          <section className="mt-5 grid gap-4 xl:grid-cols-3">
            {canViewTeam(user?.role) ? (
              <Card>
                <CardHeader title="Teams" subtitle="Agent active time by team" href="/employees" />
                <CardBody>
                  <BarList
                    items={d!.teams.map((x) => ({
                      label: x.team,
                      value: x.activeMs,
                      formatted: formatDuration(x.activeMs),
                      meta: `${x.employees} employees · ${x.sessions} sessions`,
                      color: "var(--chart-2)",
                    }))}
                  />
                </CardBody>
              </Card>
            ) : null}

            <Card>
              <CardHeader title="Tool categories" subtitle="Allowlisted categories only" />
              <CardBody>
                <BarList
                  items={d!.toolCategories.slice(0, 7).map((c) => ({
                    label: TOOL_CATEGORY_LABEL[c.category] ?? c.category,
                    value: c.calls,
                    formatted: formatNumber(c.calls),
                    color: "var(--chart-5)",
                  }))}
                />
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Engineering outcomes" subtitle="Observed check results" />
              <CardBody>
                <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-line">
                  {[
                    ["Model calls", formatNumber(t!.modelRequests)],
                    ["Tool calls", formatNumber(t!.toolCalls)],
                    ["File changes", formatNumber(t!.fileChanges)],
                    ["Tests run", formatNumber(t!.testsRun)],
                    ["Failed tests", formatNumber(t!.testsFailed)],
                    ["Builds run", formatNumber(t!.buildsRun)],
                    ["Failed builds", formatNumber(t!.buildsFailed)],
                    [
                      "Tokens in / out",
                      t!.tokenInput == null
                        ? "Not available"
                        : `${formatNumber(t!.tokenInput)} / ${formatNumber(t!.tokenOutput)}`,
                    ],
                  ].map(([label, value]) => (
                    <div key={label} className="bg-card px-3 py-2.5">
                      <dt className="label">{label}</dt>
                      <dd className="num mt-0.5 text-sm font-semibold text-ink-900">{value}</dd>
                    </div>
                  ))}
                </dl>
              </CardBody>
            </Card>
          </section>

          {/* ---------------- Right now (per-person live strip) ---------------- */}
          {(live.data?.people?.length ?? 0) > 0 ? (
            <section className="mt-5">
              <Card>
                <CardHeader
                  title="Right now"
                  subtitle="What each connected agent performed in the last two hours · most recent first"
                />
                <div className="overflow-x-auto">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Person</th>
                        <th>AI tool</th>
                        <th>State</th>
                        <th>Last model</th>
                        <th>Last tool</th>
                        <th className="text-right">Events this hour</th>
                        <th>Last event</th>
                      </tr>
                    </thead>
                    <tbody>
                      {live.data!.people!.map((p) => (
                        <tr key={p.developerId}>
                          <td>
                            <Link
                              href={`/employees/${p.developerId}`}
                              className="text-sm font-medium text-ink-900 hover:text-brand-600"
                            >
                              {p.displayName}
                            </Link>
                          </td>
                          <td>{p.provider ? <ProviderBadge provider={p.provider} size="sm" /> : <span className="hint">—</span>}</td>
                          <td>
                            {p.sessionState === "active" ? (
                              <span className="badge-ok" title="Agent event in the last 10 minutes">
                                <span className="pulse-online h-1.5 w-1.5 rounded-full bg-conn-ok" aria-hidden />
                                Agent active
                              </span>
                            ) : (
                              <span className="badge-neutral" title="Last agent event 10–120 minutes ago">
                                Recent
                              </span>
                            )}
                          </td>
                          <td className="max-w-[180px] truncate text-sm text-ink-700">{p.lastModel ?? <span className="hint">Not reported</span>}</td>
                          <td className="max-w-[160px] truncate text-sm text-ink-700">{p.lastTool ?? <span className="hint">—</span>}</td>
                          <td className="num text-right text-sm text-ink-700">{p.eventsThisHour}</td>
                          <td className="whitespace-nowrap text-sm text-ink-500">{formatRelative(p.lastEventAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </section>
          ) : null}

          {/* ---------------- Live strip ---------------- */}
          <section className="mt-5 grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader
                title="Latest sessions"
                subtitle="Sessions with activity in the last 24 hours"
              />
              {(live.data?.activeSessions ?? []).length === 0 ? (
                <EmptyState
                  compact
                  title="No recent sessions"
                  body="No agent session has reported activity in the last 24 hours."
                />
              ) : (
                <ul
                  className={`divide-y divide-line ${
                    (live.data?.activeSessions.length ?? 0) > 6 ? "scroll-y-sm" : ""
                  }`}
                >
                  {live.data!.activeSessions.map((s) => (
                    <li key={s.sessionId} className="flex items-center gap-3 px-5 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/employees/${s.developerId}`}
                            className="truncate text-sm font-medium text-ink-900 hover:text-brand-600"
                          >
                            {s.displayName}
                          </Link>
                          <ProviderBadge provider={s.provider} size="sm" />
                        </div>
                        <p className="hint truncate">
                          {s.project ?? "No task selected"} · {s.eventCount} events ·{" "}
                          {formatRelative(s.lastEventAt ?? s.startedAt)}
                        </p>
                      </div>
                      <Link
                        href={`/sessions/${s.sessionId}`}
                        className="shrink-0 text-xs font-medium text-brand-600 hover:text-brand-700"
                      >
                        Open
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <CardHeader
                title="Coverage & connector health"
                subtitle="Telemetry limitations, not activity judgements"
                href={canViewTeam(user?.role) ? "/connectors" : undefined}
                hrefLabel="Connectors"
              />
              <AlertList alerts={live.data?.alerts ?? []} />
              {coverage ? (
                <div className="grid grid-cols-2 gap-px border-t border-line bg-line sm:grid-cols-4">
                  {[
                    ["Gap events", coverage.gapEvents],
                    ["Partial sessions", coverage.partialSessions],
                    ["Unassigned", coverage.unassignedSessions],
                    ["No telemetry", coverage.employeesWithoutTelemetry],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="bg-card px-4 py-2.5">
                      <p className="label">{label}</p>
                      <p className="num mt-0.5 text-sm font-semibold text-ink-900">
                        {formatNumber(Number(value))}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}
            </Card>
          </section>

          {/* ---------------- Connector table ---------------- */}
          {canViewTeam(user?.role) && (live.data?.connectors.length ?? 0) > 0 ? (
            <section className="mt-5">
              <Card className="card-table">
                <CardHeader
                  title="Connectors"
                  subtitle="One registered installation per employee and AI tool"
                  href="/connectors"
                />
                <TableScroll>
                  <table className="tbl min-w-[640px]">
                    <thead>
                      <tr>
                        <th>Employee</th>
                        <th>AI tool</th>
                        <th>State</th>
                        <th>Last heartbeat</th>
                        <th className="text-right">Queue</th>
                        <th>Version</th>
                      </tr>
                    </thead>
                    <tbody>
                      {live.data!.connectors.map((c) => (
                        <tr key={c.deviceId}>
                          <td>
                            <Link
                              href={`/employees/${c.developerId}`}
                              className="text-sm font-medium text-ink-900 hover:text-brand-600"
                            >
                              {c.displayName}
                            </Link>
                            <span className="hint block">{c.team}</span>
                          </td>
                          <td>
                            <ProviderBadge provider={c.provider} size="sm" />
                          </td>
                          <td>
                            <ConnectorBadge state={c.state} />
                          </td>
                          <td className="num text-sm text-ink-500">
                            {formatRelative(c.lastHeartbeat)}
                          </td>
                          <td className="num text-right text-sm text-ink-500">
                            {c.queueDepth ?? "—"}
                          </td>
                          <td className="num text-sm text-ink-500">
                            {c.connectorVersion ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableScroll>
              </Card>
            </section>
          ) : null}
        </>
      )}
    </AppShell>
  );
}
