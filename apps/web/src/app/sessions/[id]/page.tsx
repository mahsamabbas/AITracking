"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Callout } from "@/components/ui/Callout";
import { Tabs } from "@/components/ui/Tabs";
import { Badge } from "@/components/ui/Badge";
import {
  EmptyState,
  ErrorState,
  LoadingBlock,
  NotFoundState,
} from "@/components/ui/States";
import { BarList } from "@/components/charts/BarList";
import { EventTimeline } from "@/components/domain/EventTimeline";
import { DurationSplit } from "@/components/domain/DurationSplit";
import { MetricGrid } from "@/components/domain/MetricGrid";
import {
  ClassificationBadge,
  CoverageBadge,
  ProviderBadge,
} from "@/components/domain/Badges";
import { useApi } from "@/lib/use-api";
import {
  formatDateTime,
  formatDuration,
  formatNumber,
  formatTime,
} from "@/lib/format";
import { providerMeta } from "@/lib/providers";
import {
  ACTIVITY_TYPE,
  ACTIVITY_TYPE_ORDER,
  TOOL_CATEGORY_LABEL,
  classificationOf,
  LONG_QUIET_GAPS,
  REVIEWING_NO_AI,
} from "@/lib/vocab";
import type { SessionDetail } from "@/lib/types";

type TabId = "timeline" | "metrics" | "context";

export default function SessionDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [tab, setTab] = useState<TabId>("timeline");
  const [typeFilter, setTypeFilter] = useState<string>("");

  const query = useApi<SessionDetail>(`/v1/sessions/${id}`);
  const d = query.data;
  const s = d?.session;

  const eventsByType = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of d?.events ?? []) {
      const t = e.activity_type ?? inferType(e.event_type);
      map.set(t, (map.get(t) ?? 0) + 1);
    }
    return map;
  }, [d?.events]);

  const filteredEvents = useMemo(() => {
    const events = d?.events ?? [];
    const withType = events.map((e) => ({
      ...e,
      activity_type: e.activity_type ?? inferType(e.event_type),
    }));
    return typeFilter
      ? withType.filter((e) => e.activity_type === typeFilter)
      : withType;
  }, [d?.events, typeFilter]);

  if (query.status === 404) {
    return (
      <AppShell title="Session">
        <NotFoundState backHref="/employees" backLabel="Back to directory" />
      </AppShell>
    );
  }

  const meta = providerMeta(s?.provider);
  // Hook-only providers report agent turns, not individual model calls.
  const turnTiming = Boolean(d?.capability?.missing.includes("model_call_timing"));
  const classification = classificationOf(s?.classification ?? "exploration");

  return (
    <AppShell
      breadcrumbs={
        <Breadcrumbs
          items={[
            { label: "Employees", href: "/employees" },
            {
              label: d?.employee?.displayName ?? "Employee",
              href: d?.employee ? `/employees/${d.employee.id}` : undefined,
            },
            {
              label: meta.label,
              href:
                d?.employee && s
                  ? `/employees/${d.employee.id}/tools/${s.provider}`
                  : undefined,
            },
            { label: "Session" },
          ]}
        />
      }
      title={s ? `Session · ${formatDateTime(s.startedAt)}` : "Session"}
      subtitle={
        d?.employee
          ? `${d.employee.displayName} · ${meta.label} · ${d.events.length} source events`
          : undefined
      }
      actions={
        d?.employee ? (
          <>
            {d.neighbours.previousId ? (
              <Link href={`/sessions/${d.neighbours.previousId}`} className="btn-ghost">
                ← Previous
              </Link>
            ) : null}
            {d.neighbours.nextId ? (
              <Link href={`/sessions/${d.neighbours.nextId}`} className="btn-ghost">
                Next →
              </Link>
            ) : null}
            <Link href={`/employees/${d.employee.id}/sessions`} className="btn-ghost">
              All sessions
            </Link>
          </>
        ) : null
      }
    >
      {query.error && query.status !== 404 ? (
        <Card>
          <ErrorState title="Could not load this session" detail={query.error} onRetry={query.reload} />
        </Card>
      ) : query.loading || !d || !s ? (
        <Card>
          <LoadingBlock rows={8} />
        </Card>
      ) : (
        <>
          {s.coverageState !== "complete" ? (
            <div className="mb-5">
              <Callout tone="warn" title="Telemetry for this session is incomplete">
                Part of this session was not captured — collection was paused or the connector
                stopped reporting. The gap is recorded rather than filled in; nothing is inferred
                about what happened during it.
              </Callout>
            </div>
          ) : null}

          {/* ---------------- Header summary ---------------- */}
          <Card className="mb-5">
            <div className="grid gap-px bg-line sm:grid-cols-2 xl:grid-cols-4">
              <div className="bg-card p-5">
                <p className="label">Started / ended</p>
                <p className="num mt-1 text-sm font-semibold text-ink-900">
                  {formatTime(s.startedAt)} → {s.endedAt ? formatTime(s.endedAt) : "in progress"}
                </p>
                <p className="hint mt-0.5">{formatDateTime(s.startedAt)}</p>
              </div>
              <div className="bg-card p-5">
                <p className="label">Agent active time</p>
                <p className="num mt-1 text-sm font-semibold text-ink-900">
                  {formatDuration(s.activeDurationMs)}
                </p>
                <p className="hint mt-0.5">
                  of {formatDuration(s.elapsedSpanMs)} elapsed span
                </p>
              </div>
              <div className="bg-card p-5">
                <p className="label">Project / work item</p>
                {s.unassigned ? (
                  <p className="mt-1 text-sm text-ink-500">Not assigned</p>
                ) : (
                  <>
                    <p className="mt-1 truncate text-sm font-semibold text-ink-900">
                      {d.project?.name ?? "Assigned"}
                    </p>
                    <p className="hint mt-0.5 truncate">{d.workItem?.title ?? "—"}</p>
                  </>
                )}
              </div>
              <div className="bg-card p-5">
                <p className="label">Session pattern</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <ProviderBadge provider={s.provider} size="sm" />
                  <ClassificationBadge id={s.classification} />
                  <CoverageBadge state={s.coverageState} />
                </div>
                <p className="hint mt-1.5">{classification.help}</p>
              </div>
            </div>
          </Card>

          <div className="grid gap-4 xl:grid-cols-3">
            {/* ---------------- Left rail ---------------- */}
            <div className="space-y-4">
              <Card>
                <CardHeader title="Duration breakdown" subtitle="Five measures, kept separate" />
                <CardBody>
                  <DurationSplit
                    totalMs={s.elapsedSpanMs}
                    totalLabel="Elapsed session span"
                    bands={[
                      {
                        label: turnTiming ? "Agent turns (prompt → stop)" : "Model execution",
                        ms: s.modelDurationMs,
                        color: "var(--chart-1)",
                        help: turnTiming
                          ? `${meta.label} does not report individual model calls. This is the time from each prompt to the agent stopping, which includes tool time.`
                          : "Sum of model API call durations, clipped to this session.",
                      },
                      {
                        label: "Tool & check execution",
                        ms: Math.max(0, s.activeDurationMs - s.modelDurationMs),
                        color: "var(--chart-2)",
                        help: "Tool, test, and build time that does not overlap a model call. Overlaps are merged before summing.",
                      },
                      {
                        label: REVIEWING_NO_AI.label,
                        ms: Math.max(0, s.interactiveSpanMs - s.activeDurationMs),
                        color: "var(--chart-muted)",
                        help: REVIEWING_NO_AI.help,
                      },
                      {
                        label: LONG_QUIET_GAPS.label,
                        ms: s.idleDurationMs,
                        color: "var(--chart-idle)",
                        help: LONG_QUIET_GAPS.durationBandHelp,
                      },
                    ]}
                  />
                  <dl className="mt-4 space-y-1.5 border-t border-line pt-3 text-xs">
                    {[
                      [turnTiming ? "Agent-turn duration" : "Model duration", formatDuration(s.modelDurationMs)],
                      ["Tool duration", formatDuration(s.toolDurationMs)],
                      ["Merged active", formatDuration(s.activeDurationMs)],
                      ["Interactive span", formatDuration(s.interactiveSpanMs)],
                      ["Elapsed span", formatDuration(s.elapsedSpanMs)],
                    ].map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-3">
                        <dt className="text-ink-500">{k}</dt>
                        <dd className="num font-medium text-ink-900">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </CardBody>
              </Card>

              <Card>
                <CardHeader title="Tool categories" subtitle="Calls in this session" />
                <CardBody>
                  <BarList
                    items={Object.entries(s.toolCategories ?? {})
                      .sort((a, b) => b[1] - a[1])
                      .map(([cat, n]) => ({
                        label: TOOL_CATEGORY_LABEL[cat] ?? cat,
                        value: n,
                        formatted: String(n),
                        color: "var(--chart-5)",
                      }))}
                    emptyLabel="No tool calls recorded in this session"
                  />
                </CardBody>
              </Card>

              {s.modelsUsed?.length ? (
                <Card>
                  <CardHeader title="Models" subtitle="Reported by the provider" />
                  <CardBody>
                    <div className="flex flex-wrap gap-1.5">
                      {s.modelsUsed.map((m) => (
                        <Badge key={m} tone="neutral">
                          {m}
                        </Badge>
                      ))}
                    </div>
                  </CardBody>
                </Card>
              ) : null}
            </div>

            {/* ---------------- Main column ---------------- */}
            <div className="xl:col-span-2">
              <Card>
                <div className="px-5 pt-1">
                  <Tabs<TabId>
                    value={tab}
                    onChange={setTab}
                    tabs={[
                      { id: "timeline", label: "Event timeline", count: d.events.length },
                      { id: "metrics", label: "Usage metrics" },
                      { id: "context", label: "Task context", count: d.contextChanges.length },
                    ]}
                  />
                </div>

                {tab === "timeline" ? (
                  <>
                    <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-5 py-3">
                      <button
                        type="button"
                        className={typeFilter === "" ? "seg-item-on" : "seg-item border border-line"}
                        onClick={() => setTypeFilter("")}
                      >
                        All {d.events.length}
                      </button>
                      {ACTIVITY_TYPE_ORDER.filter((t) => eventsByType.has(t)).map((t) => (
                        <button
                          key={t}
                          type="button"
                          className={typeFilter === t ? "seg-item-on" : "seg-item border border-line"}
                          onClick={() => setTypeFilter(typeFilter === t ? "" : t)}
                        >
                          <span
                            className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle"
                            style={{ background: ACTIVITY_TYPE[t]?.color }}
                          />
                          {ACTIVITY_TYPE[t]?.label ?? t} {eventsByType.get(t)}
                        </button>
                      ))}
                    </div>
                    <CardBody className="max-h-[720px] overflow-y-auto pt-2">
                      {filteredEvents.length === 0 ? (
                        <EmptyState compact variant="no-results" />
                      ) : (
                        <EventTimeline events={filteredEvents} limit={300} scroll={false} />
                      )}
                    </CardBody>
                  </>
                ) : null}

                {tab === "metrics" ? (
                  <CardBody className="space-y-5">
                    <div>
                      <p className="label mb-2">Agent operations</p>
                      <MetricGrid
                        columns={4}
                        metrics={[
                          {
                            label: "Model requests",
                            value: formatNumber(s.modelRequests),
                            help: "Completed model requests observed in this session.",
                          },
                          { label: "Tool calls", value: formatNumber(s.toolCalls) },
                          { label: "Events", value: formatNumber(s.eventCount) },
                          {
                            label: "Failures",
                            value: formatNumber(s.failures),
                            help: "Operations reported with a failed status.",
                          },
                        ]}
                      />
                    </div>
                    <div>
                      <p className="label mb-2">Verify & ship signals</p>
                      <MetricGrid
                        columns={4}
                        metrics={[
                          { label: "File changes", value: formatNumber(s.fileChanges) },
                          {
                            label: "Tests run",
                            value: s.testsRun ? `${s.testsRun}` : "0",
                            help: "Test runs completed during the session.",
                          },
                          {
                            label: "Tests passed / failed",
                            value: s.testsRun ? `${s.testsPassed} / ${s.testsFailed}` : "—",
                          },
                          {
                            label: "Builds run / failed",
                            value: s.buildsRun ? `${s.buildsRun} / ${s.buildsFailed}` : "0",
                          },
                        ]}
                      />
                    </div>
                    <div>
                      <p className="label mb-2">Provider-reported totals</p>
                      <MetricGrid
                        columns={3}
                        metrics={[
                          {
                            label: "Input tokens",
                            value:
                              s.tokenInput == null
                                ? "Not available from provider"
                                : formatNumber(s.tokenInput),
                            unavailable: s.tokenInput == null,
                            help: "Absent means the provider does not report it — it does not mean zero.",
                          },
                          {
                            label: "Output tokens",
                            value:
                              s.tokenOutput == null
                                ? "Not available from provider"
                                : formatNumber(s.tokenOutput),
                            unavailable: s.tokenOutput == null,
                          },
                          {
                            label: "Provider capability",
                            value: d.capability
                              ? `Tier ${d.capability.tier}${d.capability.hourly ? " · hourly" : " · daily only"}`
                              : "Unknown",
                          },
                        ]}
                      />
                    </div>
                    {d.capability?.missing.length ? (
                      <Callout tone="info" title="Provider coverage limits">
                        {d.capability.label} does not expose:{" "}
                        {d.capability.missing.join(", ").replace(/_/g, " ")}.
                      </Callout>
                    ) : null}
                  </CardBody>
                ) : null}

                {tab === "context" ? (
                  <CardBody>
                    {d.contextChanges.length === 0 ? (
                      <EmptyState
                        compact
                        variant={s.unassigned ? "unassigned" : "no-activity"}
                        title={s.unassigned ? undefined : "Context unchanged"}
                        body={
                          s.unassigned
                            ? undefined
                            : "The project and work item selected at the start of the session were not changed."
                        }
                      />
                    ) : (
                      <ol
                        className={`space-y-3 ${d.contextChanges.length > 8 ? "scroll-y-sm pr-1" : ""}`}
                      >
                        {d.contextChanges.map((c) => (
                          <li key={c.version} className="flex gap-3">
                            <span className="badge-neutral shrink-0">v{c.version}</span>
                            <div className="min-w-0">
                              <p className="text-sm text-ink-900">
                                {c.projectId ? "Re-assigned to a project" : "Context cleared"}
                              </p>
                              <p className="hint">{formatDateTime(c.recordedAt)}</p>
                            </div>
                          </li>
                        ))}
                      </ol>
                    )}
                  </CardBody>
                ) : null}
              </Card>
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}

function inferType(eventType: string): string {
  if (eventType.startsWith("model_")) return "model";
  if (eventType.startsWith("tool_")) return "tool";
  if (/^(test|build|lint|typecheck)_/.test(eventType)) return "engineering_check";
  if (eventType.startsWith("file_")) return "file_change";
  if (eventType.startsWith("session_") || eventType === "task_context_changed") return "session";
  if (/gap|capability|late_events|unassigned|paused|resumed/.test(eventType)) return "coverage";
  return "connector";
}
