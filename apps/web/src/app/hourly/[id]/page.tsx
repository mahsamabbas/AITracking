"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Callout } from "@/components/ui/Callout";
import { Badge } from "@/components/ui/Badge";
import { ErrorState, LoadingBlock, NotFoundState } from "@/components/ui/States";
import { MetricGrid } from "@/components/domain/MetricGrid";
import { EventTimeline } from "@/components/domain/EventTimeline";
import { useApi } from "@/lib/use-api";
import { formatDateTime, formatDuration, formatNumber } from "@/lib/format";
import type { ActivityEventRow } from "@/lib/types";

interface SnapshotDetail {
  snapshot: {
    id: string;
    developerId: string;
    hourStart: string;
    version: number;
    completeness: string;
    recalcReason: string | null;
    metrics: Record<string, number | null | undefined>;
  };
  sourceEvents: ActivityEventRow[];
  versions: { id: string; version: number; recalcReason: string | null }[];
}

export default function HourlyDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const query = useApi<SnapshotDetail>(`/v1/hourly-snapshots/${id}`);

  if (query.status === 404) {
    return (
      <AppShell title="Hourly summary">
        <NotFoundState backHref="/employees" backLabel="Back to directory" />
      </AppShell>
    );
  }

  const d = query.data;
  const m = d?.snapshot.metrics ?? {};

  return (
    <AppShell
      breadcrumbs={
        <Breadcrumbs
          items={[
            { label: "Employees", href: "/employees" },
            {
              label: "Employee",
              href: d ? `/employees/${d.snapshot.developerId}` : undefined,
            },
            { label: "Hourly summary" },
          ]}
        />
      }
      title={d ? `Hour of ${formatDateTime(d.snapshot.hourStart)}` : "Hourly summary"}
      subtitle="Deterministic metrics linked to every source event that produced them"
      actions={
        d ? (
          <Link href={`/employees/${d.snapshot.developerId}`} className="btn-ghost">
            Employee analytics
          </Link>
        ) : null
      }
    >
      {query.error && query.status !== 404 ? (
        <Card>
          <ErrorState title="Could not load this summary" detail={query.error} onRetry={query.reload} />
        </Card>
      ) : query.loading || !d ? (
        <Card>
          <LoadingBlock rows={8} />
        </Card>
      ) : (
        <>
          {d.snapshot.completeness !== "complete" ? (
            <div className="mb-5">
              <Callout tone="warn" title="Partial hour">
                Telemetry for this hour is incomplete. The gap is listed rather than filled in —
                nothing is inferred about the missing interval.
              </Callout>
            </div>
          ) : null}

          <Card className="mb-5">
            <CardHeader
              title="Deterministic metrics"
              subtitle="Reproducible from the source events below"
              action={
                <div className="flex items-center gap-1.5">
                  <Badge tone="neutral">v{d.snapshot.version}</Badge>
                  <Badge tone={d.snapshot.completeness === "complete" ? "ok" : "warn"}>
                    {d.snapshot.completeness}
                  </Badge>
                </div>
              }
            />
            <CardBody className="space-y-5">
              <div>
                <p className="label mb-2">Durations — never presented as one number</p>
                <MetricGrid
                  columns={5}
                  metrics={[
                    { label: "Model duration", value: formatDuration(m.modelDurationMs) },
                    { label: "Tool duration", value: formatDuration(m.toolDurationMs) },
                    {
                      label: "Merged active",
                      value: formatDuration(m.mergedActiveDurationMs),
                      help: "Overlapping model and tool intervals merged before summing.",
                    },
                    {
                      label: "Interactive span",
                      value: formatDuration(m.interactiveSpanMs),
                      help: "Excludes idle gaps over the configured threshold.",
                    },
                    { label: "Elapsed span", value: formatDuration(m.elapsedSessionSpanMs) },
                  ]}
                />
              </div>
              <div>
                <p className="label mb-2">Counts</p>
                <MetricGrid
                  columns={5}
                  metrics={[
                    { label: "Events", value: formatNumber(m.eventCount ?? 0) },
                    { label: "File changes", value: formatNumber(m.fileChanges ?? 0) },
                    { label: "Tests completed", value: formatNumber(m.testsCompleted ?? 0) },
                    { label: "Builds completed", value: formatNumber(m.buildsCompleted ?? 0) },
                    {
                      label: "Tokens in / out",
                      // null means no event this hour reported tokens; a real
                      // 0 is shown as 0.
                      value:
                        m.tokenInput == null && m.tokenOutput == null
                          ? "Not available from provider"
                          : `${formatNumber(m.tokenInput ?? 0)} / ${formatNumber(m.tokenOutput ?? 0)}`,
                      unavailable: m.tokenInput == null && m.tokenOutput == null,
                    },
                  ]}
                />
              </div>
              <p className="hint">
                No AI-generated narrative is attached to this hour. Every figure above is computed
                deterministically from the source events and can be reproduced from them.
              </p>
            </CardBody>
          </Card>

          {d.versions.length > 1 ? (
            <Card className="mb-5">
              <CardHeader
                title="Recalculation history"
                subtitle="Late events create a new version; earlier snapshots are retained"
              />
              <CardBody>
                <ul className={`space-y-2 ${d.versions.length > 6 ? "scroll-y-sm pr-1" : ""}`}>
                  {d.versions.map((v) => (
                    <li key={v.id} className="flex items-center gap-3 text-sm">
                      <Badge tone={v.id === d.snapshot.id ? "info" : "neutral"}>v{v.version}</Badge>
                      <Link href={`/hourly/${v.id}`} className="text-brand-600 hover:text-brand-700">
                        Open snapshot
                      </Link>
                      <span className="hint">{v.recalcReason ?? "original"}</span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader
              title="Source events"
              subtitle={`${d.sourceEvents.length} events in this clock hour`}
            />
            <CardBody className="max-h-[640px] overflow-y-auto pt-2">
              <EventTimeline events={d.sourceEvents} limit={300} scroll={false} />
            </CardBody>
          </Card>
        </>
      )}
    </AppShell>
  );
}
