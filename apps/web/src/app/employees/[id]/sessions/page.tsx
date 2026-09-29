"use client";

import { OrgLink } from "@/components/OrgLink";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Card, CardHeader } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { EmptyState, ErrorState, LoadingBlock, StatSkeleton } from "@/components/ui/States";
import { Pagination } from "@/components/ui/Pagination";
import { SessionTable } from "@/components/domain/SessionTable";
import {
  ActiveFilters,
  FilterBar,
  SelectFilter,
} from "@/components/filters/FilterBar";
import { ContextBar } from "@/components/ui/ContextBar";
import { RangePicker, rangeFromParams, rangeLabel, rangeParams, type RangeValue } from "@/components/filters/RangePicker";
import { useApi } from "@/lib/use-api";
import { analyticsPollMs } from "@/lib/live-poll";
import { qs } from "@/lib/api";
import { formatDuration, formatNumber } from "@/lib/format";
import { providerLabel } from "@/lib/providers";
import { CLASSIFICATION } from "@/lib/vocab";
import type { EmployeeProfile, FilterMeta, SessionRow } from "@/lib/types";
import { initialRangePreset } from "@/lib/preferences";

const PAGE_SIZE = 25;

const CLASSIFICATION_OPTIONS = Object.entries(CLASSIFICATION).map(([value, v]) => ({
  value,
  label: v.label,
}));

function SessionsInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;

  // Opened from a page with a range → show the same range, so counts match.
  const [range, setRange] = useState<RangeValue>(() => rangeFromParams(searchParams, { preset: initialRangePreset("30d") }));
  const [provider, setProvider] = useState(searchParams.get("provider") ?? "");
  const [classification, setClassification] = useState("");
  const [projectId, setProjectId] = useState("");
  const [workItemId, setWorkItemId] = useState("");
  const [coverageState, setCoverageState] = useState("");
  const [clockHour, setClockHour] = useState("");
  const [page, setPage] = useState(1);

  useEffect(
    () => setPage(1),
    [range, provider, classification, projectId, workItemId, coverageState, clockHour],
  );

  const meta = useApi<FilterMeta>("/v1/meta/filters");
  const query = useApi<{
    employee: EmployeeProfile;
    sessions: SessionRow[];
    total: number;
    matched?: { activeMs: number; fileChanges: number; testsRun: number };
    page: number;
    pageSize: number;
  }>(
    `/v1/employees/${id}/sessions${qs({
      ...rangeParams(range),
      provider: provider || undefined,
      classification: classification || undefined,
      projectId: projectId || undefined,
      workItemId: workItemId || undefined,
      coverageState: coverageState || undefined,
      clockHour: clockHour || undefined,
      page,
      pageSize: PAGE_SIZE,
    })}`,
    { pollMs: analyticsPollMs(range) },
  );

  const rows = query.data?.sessions ?? [];
  const projectNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of meta.data?.projects ?? []) map[p.id] = p.name;
    return map;
  }, [meta.data?.projects]);

  const matched = query.data?.matched;

  const chips = [
    provider ? { label: `Tool: ${providerLabel(provider)}`, onRemove: () => setProvider("") } : null,
    classification
      ? {
          label: `Session pattern: ${CLASSIFICATION[classification as keyof typeof CLASSIFICATION]?.label ?? classification}`,
          onRemove: () => setClassification(""),
        }
      : null,
    projectId
      ? { label: `Project: ${projectNames[projectId] ?? projectId}`, onRemove: () => setProjectId("") }
      : null,
    workItemId
      ? {
          label: `Work item: ${meta.data?.workItems.find((w) => w.id === workItemId)?.title ?? workItemId}`,
          onRemove: () => setWorkItemId(""),
        }
      : null,
    coverageState
      ? { label: `Coverage: ${coverageState}`, onRemove: () => setCoverageState("") }
      : null,
    clockHour !== ""
      ? { label: `Hour: ${clockHour.padStart(2, "0")}:00`, onRemove: () => setClockHour("") }
      : null,
  ].filter(Boolean) as { label: string; onRemove: () => void }[];

  const clearAll = () => {
    setProvider("");
    setClassification("");
    setProjectId("");
    setWorkItemId("");
    setCoverageState("");
    setClockHour("");
  };

  return (
    <AppShell
      breadcrumbs={
        <Breadcrumbs
          items={[
            { label: "Employees", href: "/employees" },
            { label: query.data?.employee.displayName ?? "Employee", href: `/employees/${id}` },
            { label: "Sessions" },
          ]}
        />
      }
      title="Session history"
      subtitle={`${query.data?.employee.displayName ?? "Employee"} · ${rangeLabel(range)}`}
      actions={
        <OrgLink href={`/employees/${id}`} className="btn-ghost">
          Back to analytics
        </OrgLink>
      }
    >
      <ContextBar
        subject={`${query.data?.employee.displayName ?? "Employee"} · sessions`}
        rangeLabel={rangeLabel(range)}
        fetchedAt={query.fetchedAt}
        refreshing={query.refreshing}
        onRefresh={() => { query.reload() }}
      />
      <FilterBar>
        <RangePicker value={range} onChange={setRange} />
        <SelectFilter
          label="AI tool"
          value={provider}
          onChange={setProvider}
          allLabel="All AI tools"
          width="w-full min-w-0 sm:w-[170px]"
          options={(meta.data?.providers ?? []).map((p) => ({ value: p.id, label: p.label }))}
        />
        <SelectFilter
          label="Session pattern"
          value={classification}
          onChange={setClassification}
          allLabel="All patterns"
          width="w-full min-w-0 sm:w-[180px]"
          options={CLASSIFICATION_OPTIONS}
        />
        <SelectFilter
          label="Project"
          value={projectId}
          onChange={setProjectId}
          allLabel="All projects"
          width="w-full min-w-0 sm:w-[190px]"
          options={(meta.data?.projects ?? []).map((p) => ({ value: p.id, label: p.name }))}
        />
        <SelectFilter
          label="Work item"
          value={workItemId}
          onChange={setWorkItemId}
          allLabel="All work items"
          width="w-full min-w-0 sm:w-[190px]"
          options={(meta.data?.workItems ?? [])
            .filter((w) => !projectId || w.projectId === projectId)
            .map((w) => ({ value: w.id, label: w.title }))}
        />
        <SelectFilter
          label="Coverage"
          value={coverageState}
          onChange={setCoverageState}
          allLabel="Any coverage"
          width="w-full min-w-0 sm:w-[160px]"
          options={[
            { value: "complete", label: "Complete" },
            { value: "partial", label: "Partial" },
            { value: "gap", label: "Coverage gap" },
          ]}
        />
        <SelectFilter
          label="Clock hour"
          value={clockHour}
          onChange={setClockHour}
          allLabel="Any hour"
          width="w-full min-w-0 sm:w-[130px]"
          options={Array.from({ length: 24 }, (_, hour) => ({
            value: String(hour),
            label: `${String(hour).padStart(2, "0")}:00`,
          }))}
        />
      </FilterBar>

      <ActiveFilters chips={chips} onClear={clearAll} />

      {query.loading ? (
        <StatSkeleton count={3} />
      ) : (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Page summary">
          <StatTile
            label="Sessions matched"
            icon="sessions"
            value={formatNumber(query.data?.total ?? 0)}
            hint={`showing ${rows.length} on this page`}
            accent="brand"
          />
          <StatTile
            label="Agent active (all matched)"
            icon="clock"
            value={matched ? formatDuration(matched.activeMs, { compact: true }) : "—"}
            hint="merged model + tool time"
            accent="teal"
          />
          <StatTile
            label="Output (all matched)"
            icon="file"
            value={matched ? formatNumber(matched.fileChanges) : "—"}
            unit="file changes"
            hint={matched ? `${formatNumber(matched.testsRun)} tests run` : undefined}
            accent="slate"
          />
        </section>
      )}

      <div className="mt-5">
        <Card>
          <CardHeader icon="sessions"
            title="Sessions"
            subtitle="Start and end time, duration, activity, project context, and outcome"
          />
          {query.error ? (
            <ErrorState title="Could not load sessions" detail={query.error} onRetry={query.reload} />
          ) : query.loading ? (
            <LoadingBlock rows={8} />
          ) : rows.length === 0 ? (
            <EmptyState
              variant={chips.length > 0 ? "no-results" : "no-activity"}
              action={
                chips.length > 0 ? (
                  <button type="button" className="btn-ghost" onClick={clearAll}>
                    Clear filters
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => setRange({ preset: "90d" })}
                  >
                    Widen to 90 days
                  </button>
                )
              }
            />
          ) : (
            <>
              <SessionTable sessions={rows} projectNames={projectNames} />
              <Pagination
                page={page}
                pageSize={PAGE_SIZE}
                total={query.data?.total ?? 0}
                onPage={setPage}
              />
            </>
          )}
        </Card>
      </div>
    </AppShell>
  );
}

export default function EmployeeSessionsPage() {
  return (
    <Suspense
      fallback={
        <AppShell title="Session history">
          <LoadingBlock rows={8} />
        </AppShell>
      }
    >
      <SessionsInner />
    </Suspense>
  );
}
