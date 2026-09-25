"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AiProgressPanel } from "@/components/domain/AiProgressPanel";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { Callout } from "@/components/ui/Callout";
import {
  ChartSkeleton,
  EmptyState,
  emptyActivityVariant,
  ErrorState,
  NotFoundState,
  StatSkeleton,
} from "@/components/ui/States";
import { TREND_LEGEND, TrendChart } from "@/components/charts/TrendChart";
import { ChartLegend } from "@/components/charts/ChartFrame";
import { WeekdayBars } from "@/components/charts/WeekdayBars";
import { ActivityStrip } from "@/components/domain/ActivityStrip";
import { HighlightsCard } from "@/components/domain/HighlightsCard";
import { RepositoriesCard } from "@/components/domain/RepositoriesCard";
import { ActivityCalendar, type ActivityCalendarData } from "@/components/charts/ActivityCalendar";
import { WorkdayPanel } from "@/components/domain/WorkdayPanel";
import { ActivityFeed } from "@/components/domain/ActivityFeed";
import { HourPatternChart } from "@/components/charts/HourPatternChart";
import { DonutChart } from "@/components/charts/DonutChart";
import { BarList } from "@/components/charts/BarList";
import { EmployeeProfileCard } from "@/components/domain/EmployeeProfileCard";
import { DeleteEmployeePanel } from "@/components/domain/DeleteEmployeePanel";
import { SessionTable } from "@/components/domain/SessionTable";
import { ProjectsFileChangesCard } from "@/components/domain/ProjectsFileChangesCard";
import { VerifyShipCard } from "@/components/domain/VerifyShipCard";
import { EmployeeAiPlanUsage } from "@/components/domain/EmployeeAiPlanUsage";
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
} from "@/lib/format";
import {
  LONG_QUIET_GAPS,
  WORK_MIX,
  workMixSlices,
  TOOL_CATEGORY_LABEL,
} from "@/lib/vocab";
import { canViewTeam, canManageUsers } from "@/lib/permissions";
import { deriveHighlights } from "@/lib/insights";
import type { EmployeeAnalytics, LiveStatus } from "@/lib/types";

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
  // Workday graph: the day picked on the calendar, else the most recent day with activity.
  const [pickedDay, setPickedDay] = useState<string | null>(null);
  const lastActiveDay = calendar.data?.days.length ? calendar.data.days[calendar.data.days.length - 1].date : null;
  const workDay = pickedDay ?? lastActiveDay ?? new Date().toISOString().slice(0, 10);

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
          <EmployeeProfileCard
            employee={{
              ...d.employee,
              avatarUrl: d.employee.avatarUrl ?? (isSelf ? user?.avatarUrl ?? null : null),
            }}
            devices={d.devices}
            isSelf={isSelf}
            showManageConnectors
          />

          {/* ---------------- Year of AI activity (contribution graph) ---------------- */}
          <Card className="mb-5">
            <CardHeader
              icon="calendar"
              tone="teal"
              title="AI activity — last 12 months"
              subtitle="Each square is one day in the last year — click a day for the workday view below"
            />
            <CardBody className="min-w-0 pb-6 pt-2">
              {calendar.error ? (
                <p className="hint">Could not load the activity graph.</p>
              ) : !calendar.data ? (
                <ChartSkeleton height={200} />
              ) : (
                <ActivityCalendar data={calendar.data} selected={workDay} onSelect={setPickedDay} />
              )}
            </CardBody>
          </Card>

          {/* ---------------- One day, hour by hour ---------------- */}
          {calendar.data ? (
            <WorkdayPanel employeeId={employeeId} date={workDay} onDateChange={setPickedDay} />
          ) : null}

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
              icon="clock"
              spark={d.dailyTrend.map((p) => p.activeMs)}
              current={t.activeMs}
              previous={d.previousTotals.activeMs}
              help="Agent active time: overlapping model and tool operations merged, so parallel calls are counted once."
            />
            <StatTile
              label="Sessions"
              value={formatNumber(t.sessions)}
              hint={`avg ${formatDuration(t.avgSessionMs)} active`}
              accent="teal"
              icon="sessions"
              spark={d.dailyTrend.map((p) => p.sessions)}
              current={t.sessions}
              previous={d.previousTotals.sessions}
            />
            <StatTile
              label="Working with AI"
              value={formatDuration(d.workMix?.workingMs ?? 0, { compact: true })}
              hint={`${formatDuration(t.activeMs)} agent active · ${formatDuration(t.idleMs)} idle`}
              accent="teal"
              icon="bolt"
              help="Time between agent events with no gap over 10 minutes — the same measure as the Workday graph."
            />
            <StatTile
              label={LONG_QUIET_GAPS.label}
              value={formatDuration(t.idleMs, { compact: true })}
              hint={`${d.idlePeriods.length} gaps over 10 min`}
              accent="slate"
              icon="clock"
              spark={d.dailyTrend.map((p) => p.idleMs)}
              invertDelta
              current={t.idleMs}
              previous={d.previousTotals.idleMs}
              help={LONG_QUIET_GAPS.kpiHelp}
            />
          </section>
          <ActivityStrip totals={t} commits={d.commits} />

          {/* Layout rule: each row pairs cards of similar height; charts fill their card.
              "Time split" was removed: it repeated the Work mix from session totals,
              which disagreed with the event-time figures everywhere else. */}
          {/* ---------------- Usage trend + highlights ---------------- */}
          <section className="mt-5 grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader
                icon="trend"
                title="Daily usage trend"
                subtitle={LONG_QUIET_GAPS.trendSubtitle}
                action={<ChartLegend items={TREND_LEGEND} />}
              />
              <CardBody className="pt-2">
                <TrendChart data={d.dailyTrend} emptyVariant={silenceVariant} />
              </CardBody>
            </Card>
            <HighlightsCard items={deriveHighlights(d)} />
          </section>

          {/* ---------------- Work mix + rhythm ---------------- */}
          <section className="mt-5 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            <Card>
              <CardHeader
                icon="pie"
                tone="teal"
                title={WORK_MIX.title}
                subtitle="How working time split across the four kinds of agent work"
                help={WORK_MIX.subtitle}
              />
              <CardBody>
                <DonutChart
                  data={workMixSlices(d.workMix)}
                  centerValue={formatDuration(d.workMix?.workingMs ?? 0, { compact: true })}
                  centerLabel="working time"
                  emptyVariant={silenceVariant}
                  height={220}
                />
              </CardBody>
            </Card>
            <Card>
              <CardHeader
                icon="sun"
                tone="amber"
                title="Working-hour pattern"
                subtitle="When agent activity happens (org timezone)"
              />
              <CardBody className="pt-2">
                <HourPatternChart data={d.hourPattern} emptyVariant={silenceVariant} />
              </CardBody>
            </Card>
            <Card className="lg:col-span-2 xl:col-span-1">
              <CardHeader icon="calendar" tone="sky" title="Day of week" subtitle="Agent active time · busiest day highlighted" />
              <CardBody>
                <WeekdayBars data={d.weekdayPattern} />
              </CardBody>
            </Card>
          </section>

          {/* ---------------- Verify & ship + repositories ---------------- */}
          {d.commits ? (
            <section className="mt-5 grid gap-4 xl:grid-cols-3">
              <div className={`flex min-w-0 flex-col [&>.card]:flex-1 ${d.commits.repos.length ? "xl:col-span-2" : "xl:col-span-3"}`}>
                <VerifyShipCard commits={d.commits} />
              </div>
              {d.commits.repos.length ? <RepositoriesCard repos={d.commits.repos} /> : null}
            </section>
          ) : null}

          {/* ---------------- Projects & file changes ---------------- */}
          <section className="mt-5">
            <ProjectsFileChangesCard
              trend={d.fileChangeTrend ?? []}
              workspaces={d.fileChangeWorkspaces ?? []}
              subtitle={
                isSelf
                  ? "Your AI active time, workspaces your agent edited, and file changes from your connector. Session time is counted per workspace when that folder had file activity."
                  : "This employee's AI active time, edited workspaces, and file changes from their connector. Session time is counted per workspace when that folder had file activity."
              }
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


          {/* ---------------- AI subscription usage ---------------- */}
          <section className="mt-5">
            <EmployeeAiPlanUsage rows={d.aiSubscriptions ?? []} isSelf={isSelf} />
          </section>

          {/* ---------------- Sessions ---------------- */}
          <section className="mt-5">
            <Card>
              <CardHeader
                icon="sessions"
                title="Recent sessions"
                subtitle="Most recent first — open one for its full event trail"
                href={`/employees/${employeeId}/sessions`}
                hrefLabel={`All ${d.totalSessions} sessions`}
              />
              <SessionTable sessions={d.recentSessions} projectNames={projectNames} />
            </Card>
          </section>

          {/* ---------------- Breakdown rails (lists size to their content) ---------------- */}
          <section className="mt-5 grid gap-4 xl:grid-cols-2 xl:items-start">
            <Card>
              <CardHeader icon="target" tone="sky" title="Projects & work items" subtitle="Where sessions were assigned" />
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
              <CardHeader icon="tool" tone="violet" title="Tool categories" subtitle="Allowlisted categories only" />
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
          </section>

          <section className="mt-5 grid gap-4 xl:grid-cols-2 xl:items-start">
            <Card>
              <CardHeader
                icon="clock"
                tone="slate"
                title={LONG_QUIET_GAPS.listTitle}
                subtitle={LONG_QUIET_GAPS.listSubtitle}
              />
              {d.idlePeriods.length === 0 ? (
                <EmptyState
                  compact
                  title="No long gaps observed"
                  body={LONG_QUIET_GAPS.emptyBody}
                />
              ) : (
                <ul className={`divide-y divide-line ${d.idlePeriods.length > 6 ? "scroll-y-sm" : ""}`}>
                  {d.idlePeriods.map((g, i) => (
                    <li key={`${g.from}-${g.to}-${i}`} className="flex items-center gap-3 px-5 py-2.5">
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

            <ActivityFeed range={range} developerId={employeeId} />
          </section>

          {canManageUsers(user?.role) && !isSelf && d ? (
            <section className="mt-8">
              <DeleteEmployeePanel employeeId={employeeId} displayName={d.employee.displayName} />
            </section>
          ) : null}
        </>
      )}
    </AppShell>
  );
}
