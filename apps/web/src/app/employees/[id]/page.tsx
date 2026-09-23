"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AiProgressPanel } from "@/components/domain/AiProgressPanel";
import { AiProgressTimeline } from "@/components/domain/AiProgressTimeline";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { Callout } from "@/components/ui/Callout";
import {
  ChartSkeleton,
  EmptyState,
  emptyActivityVariant,
  ErrorState,
  LoadingBlock,
  NotFoundState,
  StatSkeleton,
} from "@/components/ui/States";
import { TrendChart } from "@/components/charts/TrendChart";
import { ActivityCalendar, type ActivityCalendarData } from "@/components/charts/ActivityCalendar";
import { HourPatternChart } from "@/components/charts/HourPatternChart";
import { DonutChart } from "@/components/charts/DonutChart";
import { BarList } from "@/components/charts/BarList";
import { ConnectorBadge } from "@/components/domain/Badges";
import { DurationSplit } from "@/components/domain/DurationSplit";
import { SessionTable } from "@/components/domain/SessionTable";
import { ProjectsFileChangesCard } from "@/components/domain/ProjectsFileChangesCard";
import { EmployeeAiPlanUsage } from "@/components/domain/EmployeeAiPlanUsage";
import { EventTimeline } from "@/components/domain/EventTimeline";
import { FilterBar } from "@/components/filters/FilterBar";
import { ContextBar } from "@/components/ui/ContextBar";
import { RangePicker, rangeLabel, rangeParams, type RangeValue } from "@/components/filters/RangePicker";
import { useApi } from "@/lib/use-api";
import { useAuth } from "@/lib/auth-context";
import { qs } from "@/lib/api";
import {
  formatDate,
  formatDuration,
  formatNumber,
  formatRelative,
  initialsOf,
} from "@/lib/format";
import { classificationOf, TOOL_CATEGORY_LABEL } from "@/lib/vocab";
import { canViewTeam, canManageUsers } from "@/lib/permissions";
import type { ActivityEventRow, EmployeeAnalytics, LiveStatus } from "@/lib/types";

export default function EmployeeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { user } = useAuth();
  const [range, setRange] = useState<RangeValue>({ preset: "7d" });

  const employeeId =
    id === "self" && user?.developerId ? user.developerId : id;

  useEffect(() => {
    if (id === "self" && user?.developerId && user.developerId !== id) {
      router.replace(`/employees/${user.developerId}`);
    }
  }, [id, user?.developerId, router]);

  const query = useApi<EmployeeAnalytics>(
    employeeId && employeeId !== "self"
      ? `/v1/employees/${employeeId}${qs(rangeParams(range))}`
      : null,
  );
  const live = useApi<LiveStatus>("/v1/dashboard/live?limit=20", { pollMs: 45_000 });
  // Always the last year, independent of the range filter (like a git contribution graph).
  const calendar = useApi<ActivityCalendarData>(
    employeeId && employeeId !== "self" ? `/v1/employees/${employeeId}/activity-calendar` : null,
  );
  const timeline = useApi<{
    timezone: string;
    hourlyCards: {
      id: string;
      hourStart: string;
      hourLabel: string;
      version: number;
      completeness: string;
      metrics: { eventCount?: number; mergedActiveDurationMs?: number; fileChanges?: number };
    }[];
  }>(
    employeeId && employeeId !== "self"
      ? `/v1/developers/${employeeId}/timeline?hours=48`
      : null,
  );

  const d = query.data;
  const t = d?.totals;
  const isSelf = user?.developerId === employeeId;

  const projectNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of d?.projects ?? []) {
      if (p.projectId) map[p.projectId] = p.name;
    }
    return map;
  }, [d?.projects]);

  const recentEvents = useMemo<ActivityEventRow[]>(
    () =>
      (live.data?.recentEvents ?? [])
        .filter((e) => e.event_type !== "heartbeat_sent")
        .slice(0, 12),
    [live.data?.recentEvents],
  );

  const classificationSlices = (d?.classifications ?? []).map((c) => {
    const info = classificationOf(c.classification);
    return {
      name: info.label,
      value: c.sessions,
      formatted: String(c.sessions),
      color: info.productive
        ? c.classification === "engineering_output"
          ? "var(--chart-2)"
          : c.classification === "assisted_editing"
            ? "var(--chart-1)"
            : "var(--chart-6)"
        : "var(--chart-idle)",
    };
  });

  const crumbs = canViewTeam(user?.role)
    ? [
        { label: "Organisation", href: "/" },
        { label: "Employees", href: "/employees" },
        { label: d?.employee.displayName ?? "Employee" },
      ]
    : [{ label: "Overview", href: "/" }, { label: "My activity" }];

  if (query.status === 404) {
    return (
      <AppShell title="Employee">
        <NotFoundState backHref="/employees" backLabel="Back to directory" />
      </AppShell>
    );
  }
  if (query.status === 403) {
    return (
      <AppShell title="Employee">
        <Card>
          <EmptyState
            variant="no-permission"
            action={
              <Link href="/" className="btn-ghost">
                Back to overview
              </Link>
            }
          />
        </Card>
      </AppShell>
    );
  }

  const worstLive = (d?.devices ?? []).find((x) => x.state !== "online");
  const silenceVariant = emptyActivityVariant(d?.devices ?? []);

  return (
    <AppShell
      breadcrumbs={<Breadcrumbs items={crumbs} />}
      title={d?.employee.displayName ?? "Employee"}
      subtitle={
        d
          ? `${d.employee.title ?? "Engineer"} · ${d.employee.team ?? "No team"} · ${rangeLabel(range)}`
          : undefined
      }
      actions={
        d ? (
          <>
            <Link href={`/employees/${employeeId}/sessions`} className="btn-ghost">
              All sessions
              <span className="num ml-1 text-ink-400">{d.totalSessions}</span>
            </Link>
            {canViewTeam(user?.role) ? (
              <Link href="/employees" className="btn-ghost">
                Directory
              </Link>
            ) : null}
          </>
        ) : null
      }
    >
      <ContextBar
        subject={d?.employee.displayName ?? "Employee"}
        rangeLabel={rangeLabel(range)}
        fetchedAt={query.fetchedAt}
        live={Boolean(live.data?.generatedAt)}
        refreshing={query.refreshing || live.refreshing}
        onRefresh={() => { query.reload(); live.reload(); }}
      />
      <FilterBar>
        <RangePicker value={range} onChange={setRange} />
      </FilterBar>

      {query.error && query.status !== 404 && query.status !== 403 ? (
        <Card>
          <ErrorState
            title="Could not load this employee"
            detail={query.error}
            onRetry={query.reload}
          />
        </Card>
      ) : query.loading || !d || !t ? (
        <>
          <StatSkeleton />
          <div className="card mt-5">
            <ChartSkeleton height={260} />
          </div>
        </>
      ) : (
        <>
          {/* ---------------- Identity + connectors ---------------- */}
          <Card className="mb-5">
            <div className="flex flex-wrap items-center gap-4 p-5">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700">
                {initialsOf(d.employee.displayName)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold text-ink-900">
                  {d.employee.displayName}
                  {isSelf ? <span className="badge-info ml-2">You</span> : null}
                </p>
                <p className="hint">
                  {d.employee.email} · joined {formatDate(d.employee.joinedAt)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {isSelf ? (
                  <Link href="/my-connectors" className="btn-ghost h-8 text-xs">
                    My connectors
                  </Link>
                ) : canManageUsers(user?.role) ? (
                  <Link href="/connectors" className="btn-ghost h-8 text-xs">
                    Connector health
                  </Link>
                ) : null}
                {d.devices.length === 0 ? (
                  <span className="badge-warn">No connector registered</span>
                ) : (
                  d.devices.map((dev) => (
                    <span key={dev.deviceId} className="flex items-center gap-1.5">
                      <ConnectorBadge state={dev.state} />
                      <span className="hint">
                        {dev.label ?? dev.provider} · {formatRelative(dev.lastHeartbeat)}
                      </span>
                    </span>
                  ))
                )}
              </div>
            </div>
          </Card>

          {/* ---------------- Year of AI activity (contribution graph) ---------------- */}
          <Card className="mb-5">
            <CardHeader
              title="AI activity — last 12 months"
              subtitle={
                calendar.data
                  ? `${formatNumber(calendar.data.totals.activeDays)} active days · ${formatNumber(calendar.data.totals.sessions)} sessions · ${formatDuration(calendar.data.totals.activeMs, { compact: true })} AI active · days in ${calendar.data.timezone}`
                  : "Each square is one day, shaded by AI agent active time"
              }
            />
            <CardBody>
              {calendar.error ? (
                <p className="hint">Could not load the activity graph.</p>
              ) : !calendar.data ? (
                <ChartSkeleton height={130} />
              ) : (
                <ActivityCalendar data={calendar.data} />
              )}
            </CardBody>
          </Card>

          {isSelf && d.devices.length === 0 ? (
            <div className="mb-5">
              <Callout
                tone="warn"
                title="No connector is sending activity yet"
                action={
                  <Link href="/my-connectors" className="btn-ghost h-8 text-xs">
                    Activate key →
                  </Link>
                }
              >
                Tracking starts after an administrator issues a connector key and you activate it
                on this computer. You cannot add AI tools yourself.
              </Callout>
            </div>
          ) : null}

          {worstLive ? (
            <div className="mb-5">
              <Callout
                tone={worstLive.state === "offline" ? "bad" : "warn"}
                title={
                  worstLive.state === "paused"
                    ? "Collection is paused on one connector"
                    : "Telemetry may be incomplete for this period"
                }
              >
                A coverage gap is recorded so the missing interval stays visible. Absence of
                telemetry is never treated as evidence that no work happened.
              </Callout>
            </div>
          ) : null}

          {/* ---------------- KPIs ---------------- */}
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Key metrics">
            <StatTile
              label="Total AI usage"
              value={formatDuration(t.activeMs, { compact: true })}
              hint="merged model + tool time"
              accent="brand"
              current={t.activeMs}
              previous={d.previousTotals.activeMs}
              help="Agent active time: overlapping model and tool operations merged, so parallel calls are counted once."
            />
            <StatTile
              label="Sessions"
              value={formatNumber(t.sessions)}
              hint={`avg ${formatDuration(t.avgSessionMs)} active`}
              accent="teal"
              current={t.sessions}
              previous={d.previousTotals.sessions}
            />
            <StatTile
              label="Productive share"
              value={t.activeMs ? `${Math.round((t.productiveMs / t.activeMs) * 100)}%` : "—"}
              hint={`${formatDuration(t.productiveMs)} of agent activity`}
              accent="teal"
              help="Share of agent active time in sessions that produced file changes, tests, builds, or exploration work. It describes observed telemetry, not a rating of the person."
            />
            <StatTile
              label="In-session idle"
              value={formatDuration(t.idleMs, { compact: true })}
              hint={`${d.idlePeriods.length} gaps over 10 min`}
              accent="slate"
              invertDelta
              current={t.idleMs}
              previous={d.previousTotals.idleMs}
              help="Gaps over the idle threshold inside sessions. The person may have been working without the agent."
            />
          </section>

          {/* ---------------- AI progress (primary module) ---------------- */}
          <section className="mt-5" aria-label="AI progress">
            <AiProgressPanel
              progress={d.aiProgress}
              employeeId={employeeId}
              emptyVariant={silenceVariant}
            />
          </section>
          <section className="mt-5">
            <AiProgressTimeline employeeId={employeeId} />
          </section>

          {/* ---------------- Trend + split ---------------- */}
          <section className="mt-5 grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader
                title="Daily usage trend"
                subtitle="Agent active time and in-session idle time"
              />
              <CardBody className="pt-2">
                <TrendChart
                  data={d.dailyTrend}
                  emptyVariant={silenceVariant}
                />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Time split" subtitle="Five separate measures (never summed)" />
              <CardBody>
                <DurationSplit
                  totalMs={t.elapsedMs}
                  totalLabel="Elapsed session span"
                  bands={[
                    {
                      label: "Model calls",
                      ms: t.modelMs,
                      color: "var(--chart-1)",
                      help: "Time model requests were executing.",
                    },
                    {
                      label: "Tool & check calls",
                      ms: Math.max(0, t.activeMs - t.modelMs),
                      color: "var(--chart-2)",
                      help: "Tool, test, and build execution time not overlapping a model call.",
                    },
                    {
                      label: "In-session, agent idle",
                      ms: Math.max(0, t.elapsedMs - t.activeMs - t.idleMs),
                      color: "var(--chart-muted)",
                      help: "Inside the interactive span with no agent operation running — reading, typing, reviewing.",
                    },
                    {
                      label: "Idle gaps",
                      ms: t.idleMs,
                      color: "var(--chart-idle)",
                      help: "Gaps over 10 minutes. Excluded from the interactive span by the aggregation rules.",
                    },
                  ]}
                />
              </CardBody>
            </Card>
          </section>

          {/* ---------------- Projects & file changes ---------------- */}
          <section className="mt-5">
            <ProjectsFileChangesCard
              trend={d.fileChangeTrend ?? []}
              workspaces={d.fileChangeWorkspaces ?? []}
              dailyUsage={d.dailyTrend}
              totals={{
                activeMs: t.activeMs,
                sessions: t.sessions,
                fileChanges: t.fileChanges,
              }}
              subtitle={
                isSelf
                  ? "Your AI active time, workspaces your agent edited, and file changes from your connector. Session time is counted per workspace when that folder had file activity."
                  : "This employee's AI active time, edited workspaces, and file changes from their connector. Session time is counted per workspace when that folder had file activity."
              }
            />
          </section>


          {/* ---------------- AI subscription usage ---------------- */}
          <section className="mt-5">
            <EmployeeAiPlanUsage rows={d.aiSubscriptions ?? []} isSelf={isSelf} />
          </section>


          {/* ---------------- Hourly timeline ---------------- */}
          <section className="mt-5">
            <Card>
              <CardHeader
                title="Hourly timeline"
                subtitle={
                  timeline.data?.timezone
                    ? `Latest version of each hour · ${timeline.data.timezone}`
                    : "One card per clock hour, linked to its source events"
                }
              />
              {timeline.error ? (
                <ErrorState
                  title="Could not load hourly cards"
                  detail={timeline.error}
                  onRetry={timeline.reload}
                />
              ) : timeline.loading ? (
                <LoadingBlock rows={4} />
              ) : (timeline.data?.hourlyCards.length ?? 0) === 0 ? (
                <EmptyState
                  compact
                  title="No hourly summaries yet"
                  body="Hourly cards appear after the worker finalises a completed hour. The current hour stays open until it closes."
                />
              ) : (
                <div
                  className={`grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3 ${
                    timeline.data!.hourlyCards.length > 6 ? "scroll-y pr-1" : ""
                  }`}
                >
                  {timeline.data!.hourlyCards.map((card) => (
                    <Link
                      key={card.id}
                      href={`/hourly/${card.id}`}
                      className="rounded-xl border border-line bg-card p-3 transition hover:border-brand-300"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-ink-900">{card.hourLabel}</p>
                        <span
                          className={
                            card.completeness === "complete" ? "badge-ok" : "badge-warn"
                          }
                        >
                          {card.completeness}
                        </span>
                      </div>
                      <p className="hint mt-2">
                        {formatDuration(card.metrics.mergedActiveDurationMs ?? 0)} active ·{" "}
                        {card.metrics.eventCount ?? 0} events · {card.metrics.fileChanges ?? 0} file
                        changes
                      </p>
                      <p className="hint">v{card.version}</p>
                    </Link>
                  ))}
                </div>
              )}
            </Card>
          </section>

          {/* ---------------- Sessions + idle + timeline ---------------- */}
          <section className="mt-5">
            <Card>
              <CardHeader
                title="Recent sessions"
                subtitle="Most recent first — open one for its full event trail"
                href={`/employees/${employeeId}/sessions`}
                hrefLabel={`All ${d.totalSessions} sessions`}
              />
              <SessionTable sessions={d.recentSessions} projectNames={projectNames} />
            </Card>
          </section>

          {/* ---------------- Patterns ---------------- */}
          <section className="mt-5 grid gap-4 xl:grid-cols-3">
            <Card>
              <CardHeader
                title="Working-hour pattern"
                subtitle="When agent activity happens (org timezone)"
              />
              <CardBody className="pt-2">
                <HourPatternChart data={d.hourPattern} emptyVariant={silenceVariant} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Activity mix" subtitle="Sessions by observed outcome" />
              <CardBody>
                <DonutChart
                  data={classificationSlices}
                  centerValue={formatNumber(t.sessions)}
                  centerLabel="sessions"
                  emptyVariant={silenceVariant}
                />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Day of week" subtitle="Agent active time" />
              <CardBody>
                <BarList
                  items={d.weekdayPattern.map((w) => ({
                    label: w.label,
                    value: w.activeMs,
                    formatted: formatDuration(w.activeMs),
                    color: "var(--chart-2)",
                  }))}
                />
              </CardBody>
            </Card>
          </section>

          {/* ---------------- Breakdown rails ---------------- */}
          <section className="mt-5 grid gap-4 xl:grid-cols-3">
            <Card>
              <CardHeader title="Projects & work items" subtitle="Where sessions were assigned" />
              <CardBody>
                <BarList
                  items={d.projects.slice(0, 6).map((p) => ({
                    label: p.name,
                    value: p.activeMs,
                    formatted: formatDuration(p.activeMs),
                    meta: `${p.sessions} sessions`,
                    color: p.projectId ? "var(--chart-1)" : "var(--chart-idle)",
                  }))}
                />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Tool categories" subtitle="Allowlisted categories only" />
              <CardBody>
                <BarList
                  items={d.toolCategories.slice(0, 7).map((c) => ({
                    label: TOOL_CATEGORY_LABEL[c.category] ?? c.category,
                    value: c.calls,
                    formatted: formatNumber(c.calls),
                    color: "var(--chart-5)",
                  }))}
                />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Models used" subtitle="Reported by the provider" />
              <CardBody>
                {d.models.length === 0 ? (
                  <EmptyState
                    compact
                    variant="provider-missing"
                    body="No model names were reported for this period."
                  />
                ) : (
                  <BarList
                    items={d.models.slice(0, 6).map((m) => ({
                      label: m.model,
                      value: m.sessions,
                      formatted: `${m.sessions} sessions`,
                      color: "var(--chart-6)",
                    }))}
                  />
                )}
              </CardBody>
            </Card>
          </section>

          <section className="mt-5 grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader
                title="Idle & coverage periods"
                subtitle="Gaps over 10 minutes, capped at 4 hours"
              />
              {d.idlePeriods.length === 0 ? (
                <EmptyState
                  compact
                  title="No long gaps observed"
                  body="Agent activity in this period had no break longer than the 10-minute idle threshold."
                />
              ) : (
                <ul className={`divide-y divide-line ${d.idlePeriods.length > 6 ? "scroll-y-sm" : ""}`}>
                  {d.idlePeriods.map((g) => (
                    <li key={g.from} className="flex items-center gap-3 px-5 py-2.5">
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${
                          g.reason === "coverage_gap" ? "bg-conn-warn" : "bg-conn-idle"
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="num text-sm text-ink-900">
                          {formatDate(g.from)} · {new Date(g.from).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                          {" → "}
                          {new Date(g.to).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                        </p>
                        <p className="hint">
                          {g.reason === "coverage_gap"
                            ? "Coverage gap — collection was paused or the connector stopped reporting"
                            : "No agent events observed in this window"}
                        </p>
                      </div>
                      <span className="num shrink-0 text-sm font-medium text-ink-700">
                        {formatDuration(g.durationMs)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <CardHeader
                title="Live activity feed"
                subtitle="IDE companion events — connector heartbeats are omitted"
              />
              <CardBody className="pt-1">
                <EventTimeline
                  events={recentEvents}
                  limit={80}
                  emptyBody="Connector heartbeats are hidden here. Saves, edits, and sessions from any Cursor window with the Techlio companion will appear — chat-only Cursor use is not sent by the IDE."
                />
              </CardBody>
            </Card>
          </section>
        </>
      )}
    </AppShell>
  );
}
