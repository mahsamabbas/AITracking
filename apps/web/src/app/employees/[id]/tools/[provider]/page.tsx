"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { Callout } from "@/components/ui/Callout";
import {
  ChartSkeleton,
  EmptyState,
  ErrorState,
  NotFoundState,
  StatSkeleton,
} from "@/components/ui/States";
import { TrendChart } from "@/components/charts/TrendChart";
import { HourPatternChart } from "@/components/charts/HourPatternChart";
import { DonutChart } from "@/components/charts/DonutChart";
import { BarList } from "@/components/charts/BarList";
import { SessionTable } from "@/components/domain/SessionTable";
import { FilterBar } from "@/components/filters/FilterBar";
import { ContextBar } from "@/components/ui/ContextBar";
import { RangePicker, rangeLabel, rangeParams, type RangeValue } from "@/components/filters/RangePicker";
import { useApi } from "@/lib/use-api";
import { qs } from "@/lib/api";
import { formatDuration, formatNumber, formatRelative } from "@/lib/format";
import { providerMeta } from "@/lib/providers";
import { classificationOf, TOOL_CATEGORY_LABEL } from "@/lib/vocab";
import type { ToolAnalytics } from "@/lib/types";

export default function EmployeeToolPage() {
  const params = useParams();
  const id = params.id as string;
  const provider = params.provider as string;
  const [range, setRange] = useState<RangeValue>({ preset: "7d" });

  const query = useApi<ToolAnalytics>(
    `/v1/employees/${id}/tools/${provider}${qs(rangeParams(range))}`,
  );

  const d = query.data;
  const t = d?.totals;
  const meta = providerMeta(provider);

  const projectNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of d?.projects ?? []) if (p.projectId) map[p.projectId] = p.name;
    return map;
  }, [d?.projects]);

  const modelRequestsAvailable =
    !d?.capability?.missing.includes("model_request") && (d?.totals.modelRequests ?? 0) > 0;

  const share =
    d && d.shareOfEmployeeActiveMs > 0
      ? Math.round((d.totals.activeMs / d.shareOfEmployeeActiveMs) * 100)
      : 0;

  if (query.status === 404) {
    return (
      <AppShell title="AI tool">
        <NotFoundState backHref={`/employees/${id}`} backLabel="Back to employee" />
      </AppShell>
    );
  }

  return (
    <AppShell
      breadcrumbs={
        <Breadcrumbs
          items={[
            { label: "Employees", href: "/employees" },
            { label: d?.employee.displayName ?? "Employee", href: `/employees/${id}` },
            { label: meta.label },
          ]}
        />
      }
      title={`${meta.label} · ${d?.employee.displayName ?? ""}`.trim()}
      subtitle={`How this employee uses ${meta.label} · ${rangeLabel(range)}`}
      actions={
        <>
          <Link
            href={`/employees/${id}/sessions${qs({ provider })}`}
            className="btn-ghost"
          >
            Session history
          </Link>
          <Link href={`/employees/${id}`} className="btn-ghost">
            Employee
          </Link>
        </>
      }
    >
      <ContextBar
        subject={`${d?.employee.displayName ?? "Employee"} · ${meta.label}`}
        rangeLabel={rangeLabel(range)}
        fetchedAt={query.fetchedAt}
        refreshing={query.refreshing}
        onRefresh={() => { query.reload() }}
      />
      <FilterBar>
        <RangePicker value={range} onChange={setRange} />
      </FilterBar>

      {d?.capability && (d.capability.tier === "B" || d.capability.missing.length > 0) ? (
        <div className="mb-5">
          <Callout tone="warn" title={`${meta.label} does not expose every metric`}>
            {d.capability.emptyState || d.capability.note}
            {d.capability.missing.length > 0 ? (
              <span className="mt-1 block">
                Unavailable from this provider:{" "}
                {(d.capability.unavailable ?? d.capability.missing).join(" · ").replace(/_/g, " ")}. These read
                as “not available”, never as zero.
              </span>
            ) : null}
            <span className="mt-1 block opacity-80">
              {d.capability.capabilitySource === "connector"
                ? `Reported live by this person's connector ${formatRelative(d.capability.reportedAt ?? null)}${d.capability.observedVia?.length ? ` · observed via ${d.capability.observedVia.join(", ")}` : ""}.`
                : "No recent connector report — this is the provider's documented capability."}
            </span>
          </Callout>
        </div>
      ) : meta.note ? (
        <div className="mb-5">
          <Callout tone="info" title={`About ${meta.label} telemetry`}>
            {meta.note}
          </Callout>
        </div>
      ) : null}

      {query.error && query.status !== 404 ? (
        <Card>
          <ErrorState title="Could not load tool analytics" detail={query.error} onRetry={query.reload} />
        </Card>
      ) : query.loading || !d || !t ? (
        <>
          <StatSkeleton />
          <div className="card mt-5">
            <ChartSkeleton height={260} />
          </div>
        </>
      ) : t.sessions === 0 ? (
        <Card>
          <EmptyState
            variant="no-activity"
            title={`No ${meta.label} activity in this period`}
            body="This employee has no observed sessions with this AI tool in the selected range."
            action={
              <button type="button" className="btn-ghost" onClick={() => setRange({ preset: "30d" })}>
                Widen to 30 days
              </button>
            }
          />
        </Card>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Key metrics">
            <StatTile
              label={`${meta.label} active time`}
              value={formatDuration(t.activeMs, { compact: true })}
              hint={`${share}% of this employee's AI time`}
              accent="brand"
              current={t.activeMs}
              previous={d.previousTotals.activeMs}
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
              label="Model requests"
              value={modelRequestsAvailable ? formatNumber(t.modelRequests) : "Not available"}
              hint={
                t.tokenInput == null
                  ? undefined
                  : `${formatNumber(t.tokenInput)} in / ${formatNumber(t.tokenOutput)} out tokens`
              }
              accent="slate"
              current={modelRequestsAvailable ? t.modelRequests : undefined}
              previous={modelRequestsAvailable ? d.previousTotals.modelRequests : undefined}
              help={
                modelRequestsAvailable
                  ? undefined
                  : "This provider does not report model requests. The metric is unavailable — it is not zero."
              }
            />
            <StatTile
              label="Engineering output"
              value={formatNumber(t.fileChanges)}
              unit="file changes"
              hint={`${t.testsRun} tests · ${t.buildsRun} builds`}
              accent={t.testsFailed > 0 ? "amber" : "teal"}
              current={t.fileChanges}
              previous={d.previousTotals.fileChanges}
            />
          </section>

          <section className="mt-5 grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader
                title={`${meta.label} usage over time`}
                subtitle="Agent active time per day with this tool"
              />
              <CardBody className="pt-2">
                <TrendChart data={d.dailyTrend} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Session outcomes" subtitle="What sessions with this tool produced" />
              <CardBody>
                <DonutChart
                  data={d.classifications.map((c) => {
                    const info = classificationOf(c.classification);
                    return {
                      name: info.label,
                      value: c.sessions,
                      formatted: String(c.sessions),
                      color: info.productive ? meta.color : "var(--chart-idle)",
                    };
                  })}
                  centerValue={formatNumber(t.sessions)}
                  centerLabel="sessions"
                />
              </CardBody>
            </Card>
          </section>

          <section className="mt-5 grid gap-4 xl:grid-cols-3">
            <Card>
              <CardHeader title="Working-hour pattern" subtitle={`When ${meta.label} is used`} />
              <CardBody className="pt-2">
                <HourPatternChart data={d.hourPattern} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Models" subtitle="Reported by this provider" />
              <CardBody>
                {d.models.length === 0 ? (
                  <EmptyState compact variant="provider-missing" />
                ) : (
                  <BarList
                    items={d.models.map((m) => ({
                      label: m.model,
                      value: m.sessions,
                      formatted: `${m.sessions} sessions`,
                      color: meta.color,
                    }))}
                  />
                )}
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Tool categories" subtitle="Allowlisted categories only" />
              <CardBody>
                {d.toolCategories.length === 0 ? (
                  <EmptyState compact variant="provider-missing" />
                ) : (
                  <BarList
                    items={d.toolCategories.map((c) => ({
                      label: TOOL_CATEGORY_LABEL[c.category] ?? c.category,
                      value: c.calls,
                      formatted: formatNumber(c.calls),
                      color: "var(--chart-5)",
                    }))}
                  />
                )}
              </CardBody>
            </Card>
          </section>

          <section className="mt-5">
            <Card>
              <CardHeader
                title={`${meta.label} sessions`}
                subtitle="Click a session to inspect its full event trail"
                href={`/employees/${id}/sessions${qs({ provider })}`}
                hrefLabel={`All ${d.totalSessions}`}
              />
              <SessionTable
                sessions={d.sessions}
                projectNames={projectNames}
                showProvider={false}
              />
            </Card>
          </section>
        </>
      )}
    </AppShell>
  );
}
