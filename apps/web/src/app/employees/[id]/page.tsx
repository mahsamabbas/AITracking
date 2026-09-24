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
import { TrendChart } from "@/components/charts/TrendChart";
import { ActivityCalendar, type ActivityCalendarData } from "@/components/charts/ActivityCalendar";
import { WorkdayPanel } from "@/components/domain/WorkdayPanel";
import { ActivityFeed } from "@/components/domain/ActivityFeed";
import { HourPatternChart } from "@/components/charts/HourPatternChart";
import { DonutChart } from "@/components/charts/DonutChart";
import { BarList } from "@/components/charts/BarList";
import { ConnectorBadge } from "@/components/domain/Badges";
import { EmployeeProfileCard } from "@/components/domain/EmployeeProfileCard";
import { DeleteEmployeePanel } from "@/components/domain/DeleteEmployeePanel";
import { DurationSplit } from "@/components/domain/DurationSplit";
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
  formatRelative,
} from "@/lib/format";
import {
  AGENT_WORK_SHARE,
  classificationDonutSlices,
  LONG_QUIET_GAPS,
  REVIEWING_NO_AI,
  SESSION_MIX,
  TOOL_CATEGORY_LABEL,
} from "@/lib/vocab";
import { canViewTeam, canManageUsers } from "@/lib/permissions";
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


  const classificationSlices = useMemo(
    () => classificationDonutSlices(d?.classifications ?? []),
    [d?.classifications],
  );

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
              title="AI activity — last 12 months"
              subtitle="Each square is one day in the last year — click a day for the workday view below"
            />
            <CardBody className="pb-6 pt-2">
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
              label={AGENT_WORK_SHARE.label}
              value={t.activeMs ? `${Math.round((t.productiveMs / t.activeMs) * 100)}%` : "—"}
              hint={`${formatDuration(t.productiveMs)} of agent activity`}
              accent="teal"
              help={AGENT_WORK_SHARE.help}
            />
            <StatTile
              label={LONG_QUIET_GAPS.label}
              value={formatDuration(t.idleMs, { compact: true })}
              hint={`${d.idlePeriods.length} gaps over 10 min`}
              accent="slate"
              invertDelta
              current={t.idleMs}
              previous={d.previousTotals.idleMs}
              help={LONG_QUIET_GAPS.kpiHelp}
            />
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
              <CardHeader
                title={SESSION_MIX.title}
                subtitle={SESSION_MIX.subtitle}
              />
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

          {/* ---------------- AI progress (primary module) ---------------- */}
          <section className="mt-5" aria-label="AI progress">
            <AiProgressPanel
              progress={d.aiProgress}
              employeeId={employeeId}
              emptyVariant={silenceVariant}
            />
          </section>

          {/* ---------------- Trend + split ---------------- */}
          <section className="mt-5 grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader
                title="Daily usage trend"
                subtitle={LONG_QUIET_GAPS.trendSubtitle}
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
                      label: REVIEWING_NO_AI.label,
                      ms: Math.max(0, t.elapsedMs - t.activeMs - t.idleMs),
                      color: "var(--chart-muted)",
                      help: REVIEWING_NO_AI.help,
                    },
                    {
                      label: LONG_QUIET_GAPS.label,
                      ms: t.idleMs,
                      color: "var(--chart-idle)",
                      help: LONG_QUIET_GAPS.durationBandHelp,
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
              subtitle={
                isSelf
                  ? "Your AI active time, workspaces your agent edited, and file changes from your connector. Session time is counted per workspace when that folder had file activity."
                  : "This employee's AI active time, edited workspaces, and file changes from their connector. Session time is counted per workspace when that folder had file activity."
              }
            />
          </section>

          {/* ---------------- Commit → Verified → Shipped ---------------- */}
          {d.commits ? (
            <section className="mt-5">
              <VerifyShipCard commits={d.commits} />
            </section>
          ) : null}

          {/* ---------------- AI subscription usage ---------------- */}
          <section className="mt-5">
            <EmployeeAiPlanUsage rows={d.aiSubscriptions ?? []} isSelf={isSelf} />
          </section>

          {/* ---------------- Sessions ---------------- */}
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

          {/* ---------------- Breakdown rails ---------------- */}
          <section className="mt-5 grid gap-4 xl:grid-cols-2">
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
          </section>

          <section className="mt-5 grid gap-4 xl:grid-cols-2 xl:items-start">
            <Card>
              <CardHeader
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
