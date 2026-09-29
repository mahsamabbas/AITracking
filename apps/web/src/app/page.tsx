"use client";

import { OrgLink } from "@/components/OrgLink";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { ActivityFeed } from "@/components/domain/ActivityFeed";
import { VerifyShipCard } from "@/components/domain/VerifyShipCard";
import { HighlightsCard } from "@/components/domain/HighlightsCard";
import { TopPeopleCard } from "@/components/domain/TopPeopleCard";
import { RepositoriesCard } from "@/components/domain/RepositoriesCard";
import { ConnectorHealthCard } from "@/components/domain/ConnectorHealthCard";
import { WeekdayBars } from "@/components/charts/WeekdayBars";
import { RightNowTable } from "@/components/domain/RightNowTable";
import { ActivityStrip } from "@/components/domain/ActivityStrip";
import { CHANGE_TREND_LEGEND, ChangeTrendChart } from "@/components/charts/ChangeTrendChart";
import { ChartLegend } from "@/components/charts/ChartFrame";
import { StatTile } from "@/components/ui/StatTile";
import { Callout } from "@/components/ui/Callout";
import {
  ChartSkeleton,
  EmptyState,
  emptyActivityVariant,
  ErrorState,
  StatSkeleton,
} from "@/components/ui/States";
import { TREND_LEGEND, TrendChart } from "@/components/charts/TrendChart";
import { HourPatternChart } from "@/components/charts/HourPatternChart";
import { DonutChart } from "@/components/charts/DonutChart";
import { BarList } from "@/components/charts/BarList";
import { ConnectorBadge, ProviderBadge } from "@/components/domain/Badges";
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
import { apiDownload, apiPost, qs } from "@/lib/api";
import { formatDuration, formatNumber, formatRelative } from "@/lib/format";
import { providerLabel } from "@/lib/providers";
import {
  LONG_QUIET_GAPS,
  TOOL_CATEGORY_LABEL,
  WORK_MIX,
  workMixSlices,
} from "@/lib/vocab";
import { deriveHighlights } from "@/lib/insights";
import { canExportActivity, canViewTeam } from "@/lib/permissions";
import { analyticsPollMs, LIVE_POLL_MS } from "@/lib/live-poll";
import type {
  FilterMeta,
  LiveStatus,
  OrganizationAnalytics,
} from "@/lib/types";
import { initialRangePreset } from "@/lib/preferences";

export default function OverviewPage() {
  const { user, token } = useAuth();
  const [range, setRange] = useState<RangeValue>(() => ({ preset: initialRangePreset("7d") }));
  const [team, setTeam] = useState("");
  const [provider, setProvider] = useState("");
  const [exporting, setExporting] = useState<"csv" | "pdf" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  async function downloadExport(format: "csv" | "pdf") {
    if (!token) return;
    setExporting(format);
    setExportError(null);
    try {
      // Same range and filters as the charts on screen.
      const created = await apiPost<{ downloadUrl: string }>("/v1/activity-exports", token, {
        format,
        preset: range.preset === "custom" ? undefined : range.preset,
        from: range.preset === "custom" && range.from ? range.from : undefined,
        to: range.preset === "custom" && range.to ? range.to : undefined,
        team: team || undefined,
        provider: provider || undefined,
      });
      await apiDownload(created.downloadUrl, token, `activity-summary.${format}`);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(null);
    }
  }

  const isSelfScope = user?.role === "developer";
  const params = { ...rangeParams(range), team: team || undefined, provider: provider || undefined };

  const analytics = useApi<OrganizationAnalytics>(
    `/v1/analytics/organization${qs(params)}`,
    { pollMs: analyticsPollMs(range) },
  );
  const live = useApi<LiveStatus>("/v1/dashboard/live?limit=8", { pollMs: LIVE_POLL_MS });
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

  const toolCategoryItems = useMemo(
    () =>
      (d?.toolCategories ?? []).slice(0, 7).map((c) => ({
        label: TOOL_CATEGORY_LABEL[c.category] ?? c.category,
        value: c.calls,
        formatted: formatNumber(c.calls),
        color: "var(--chart-5)",
      })),
    [d?.toolCategories],
  );
  const highlights = useMemo(() => (d ? deriveHighlights(d) : []), [d]);
  const spark = useMemo(
    () => ({
      active: (d?.dailyTrend ?? []).map((p) => p.activeMs),
      sessions: (d?.dailyTrend ?? []).map((p) => p.sessions),
      people: (d?.dailyTrend ?? []).map((p) => p.employees),
    }),
    [d?.dailyTrend],
  );
  const teamView = canViewTeam(user?.role);

  // Agent time in range counts even when the session started before it.
  const hasActivity = (t?.sessions ?? 0) > 0 || (t?.activeMs ?? 0) > 0;
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
          : `How connected AI coding tools were used in this organisation · ${rangeLabel(range)}`
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
                {exportError ? (
                  <span role="alert" className="text-xs text-rose-600">
                    {exportError}
                  </span>
                ) : null}
              </>
            ) : null}
            <OrgLink href="/employees" className="btn-primary">
              Employee directory
            </OrgLink>
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
              width="w-full min-w-0 sm:w-[170px]"
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
          <section className="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="Key metrics">
            <StatTile
              label="AI active time"
              value={formatDuration(t!.activeMs, { compact: true })}
              hint="vs previous period"
              accent="brand"
              icon="clock"
              spark={spark.active}
              current={t!.activeMs}
              previous={prev!.activeMs}
              help="Merged model and tool execution time. Overlapping operations are counted once, and this is not the same as a person's working time."
            />
            <StatTile
              label="Sessions"
              value={formatNumber(t!.sessions)}
              hint={`avg ${formatDuration(t!.avgSessionMs)} active`}
              accent="teal"
              icon="sessions"
              spark={spark.sessions}
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
              icon={isSelfScope ? "model" : "people"}
              spark={isSelfScope ? undefined : spark.people}
              help={
                isSelfScope
                  ? "AI coding tools that reported activity for you in this period."
                  : "Employees with at least one observed agent session in this period."
              }
            />
            <StatTile
              label="Coverage warnings"
              value={formatNumber(coverageIssues + (coverage?.employeesWithoutTelemetry ?? 0))}
              hint="gaps, pauses, silent connectors"
              accent={coverageIssues > 0 ? "amber" : "slate"}
              icon="shield"
              invertDelta
              help="Telemetry limitations. A coverage gap means the system cannot confirm what happened — it never means the person was idle."
            />
          </section>

          {/* ---------------- Activity strip: what the agents did (counts) ---------------- */}
          <ActivityStrip totals={t!} commits={d!.commits} />

          {/* Layout rule: each row pairs cards of similar height; charts fill their card. */}
          {/* ---------------- Usage over time + highlights ---------------- */}
          <section className="mt-5 grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader
                icon="trend"
                title="AI usage over time"
                subtitle={LONG_QUIET_GAPS.trendSubtitle}
                action={<ChartLegend items={TREND_LEGEND} />}
              />
              <CardBody className="pt-2">
                <TrendChart data={d!.dailyTrend} />
              </CardBody>
            </Card>
            <HighlightsCard items={highlights} />
          </section>

          {/* ---------------- File changes & commits + work mix ---------------- */}
          <section className="mt-5 grid gap-4 xl:grid-cols-3">
            {d!.changeTrend ? (
              <Card className="xl:col-span-2">
                <CardHeader
                  icon="file"
                  tone="violet"
                  title="File changes & commits"
                  subtitle="Agent file edits and commits per day, from the same tracked events"
                  action={<ChartLegend items={CHANGE_TREND_LEGEND} />}
                />
                <CardBody>
                  <ChangeTrendChart
                    data={d!.changeTrend}
                    aiUsageByDay={d!.dailyTrend.map((p) => ({ date: p.date, activeMs: p.activeMs }))}
                  />
                </CardBody>
              </Card>
            ) : null}
            <Card className={d!.changeTrend ? "" : "xl:col-span-3"}>
              <CardHeader
                icon="pie"
                tone="teal"
                title={WORK_MIX.title}
                subtitle="How working time split across the four kinds of agent work"
                help={WORK_MIX.subtitle}
              />
              <CardBody>
                <DonutChart
                  data={workMixSlices(d!.workMix)}
                  centerValue={formatDuration(d!.workMix?.workingMs ?? 0, { compact: true })}
                  centerLabel="working time"
                  height={220}
                />
              </CardBody>
            </Card>
          </section>

          {/* ---------------- Verify & ship + repositories ---------------- */}
          {d!.commits ? (
            <section className="mt-5 grid gap-4 xl:grid-cols-3">
              <div className={`flex min-w-0 flex-col [&>.card]:flex-1 ${d!.commits.repos.length ? "xl:col-span-2" : "xl:col-span-3"}`}>
                <VerifyShipCard commits={d!.commits} showPerson={!isSelfScope} />
              </div>
              {d!.commits.repos.length ? <RepositoriesCard repos={d!.commits.repos} /> : null}
            </section>
          ) : null}

          {/* ---------------- People, tools, teams ---------------- */}
          <section className={`mt-5 grid gap-4 lg:grid-cols-2 ${teamView ? "xl:grid-cols-3" : ""}`}>
            {teamView ? (
              <TopPeopleCard range={range} team={team || undefined} provider={provider || undefined} />
            ) : null}
            <Card>
              <CardHeader icon="model" tone="violet" title="AI tools in use" subtitle="By agent active time" />
              <CardBody>
                <BarList items={toolItems} />
              </CardBody>
            </Card>
            {teamView ? (
              <Card>
                <CardHeader icon="team" tone="slate" title="Teams" subtitle="Agent active time by team" href="/employees" />
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
            ) : (
              <Card>
                <CardHeader icon="tool" title="What the agents did" subtitle="Tool calls by category" />
                <CardBody>
                  <BarList items={toolCategoryItems} />
                </CardBody>
              </Card>
            )}
          </section>

          {/* ---------------- Rhythm: hours, weekdays, kinds of work ---------------- */}
          <section className={`mt-5 grid gap-4 lg:grid-cols-2 ${teamView ? "xl:grid-cols-3" : ""}`}>
            <Card>
              <CardHeader
                icon="sun"
                tone="amber"
                title="Working-hour pattern"
                subtitle="When agent activity happens (org timezone)"
              />
              <CardBody className="pt-2">
                <HourPatternChart data={d!.hourPattern} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader icon="calendar" tone="sky" title="Day of week" subtitle="Agent active time · busiest day highlighted" />
              <CardBody>
                <WeekdayBars data={d!.weekdayPattern} />
              </CardBody>
            </Card>
            {teamView ? (
              <Card className="lg:col-span-2 xl:col-span-1">
                <CardHeader icon="tool" title="What the agents did" subtitle="Tool calls by category" />
                <CardBody>
                  <BarList items={toolCategoryItems} />
                </CardBody>
              </Card>
            ) : null}
          </section>

          {/* ---------------- Right now (per-person live strip) ---------------- */}
          {(live.data?.people?.length ?? 0) > 0 ? (
            <section className="mt-5">
              <Card>
                <CardHeader
                  icon="live"
                  tone="teal"
                  title="Right now"
                  subtitle="What each connected agent performed in the last two hours · most recent first"
                />
                <RightNowTable people={live.data!.people!} />
              </Card>
            </section>
          ) : null}

          {/* ---------------- Activity feed ---------------- */}
          <section className="mt-5">
            <ActivityFeed range={range} provider={provider || undefined} team={team || undefined} showPerson title="Activity feed" />
          </section>

          {/* ---------------- Coverage & connector health ---------------- */}
          {teamView && coverage ? (
            <section className="mt-5" aria-label="Coverage summary">
              <ConnectorHealthCard connectors={liveConnectors} coverage={coverage} alerts={live.data?.alerts ?? []} />
            </section>
          ) : null}
        </>
      )}
    </AppShell>
  );
}
