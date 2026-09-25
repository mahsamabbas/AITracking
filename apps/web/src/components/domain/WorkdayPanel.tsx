"use client";

import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { ChartSkeleton } from "@/components/ui/States";
import { ProviderBadge } from "@/components/domain/Badges";
import { WORKDAY_SERIES, WorkdayChart, clockIn, type WorkdayData } from "@/components/charts/WorkdayChart";
import { useApi } from "@/lib/use-api";
import { formatDuration, formatNumber } from "@/lib/format";

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0" title={hint}>
      <p className="text-2xs font-medium uppercase tracking-[0.06em] text-ink-500">{label}</p>
      <p className="num mt-0.5 truncate text-base font-semibold text-ink-900">{value}</p>
    </div>
  );
}

/**
 * Per-day tracking: when the person started and stopped working with AI
 * agents, their breaks, and how each hour split into AI active, idle,
 * exploration, and editing — with files changed per hour.
 */
export function WorkdayPanel({
  employeeId,
  date,
  onDateChange,
}: {
  employeeId: string;
  date: string;
  onDateChange: (date: string) => void;
}) {
  const query = useApi<WorkdayData>(`/v1/employees/${employeeId}/workday?date=${date}`);
  const d = query.data;
  const t = d?.totals;
  const today = new Date().toISOString().slice(0, 10);
  const pretty = new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <Card className="mb-5">
      <CardHeader
        icon="sun"
        tone="amber"
        title="Workday"
        subtitle={`${pretty}${d ? ` · times in ${d.timezone}` : ""} · minutes per hour`}
        action={
          <div className="flex items-center gap-1.5">
            <button type="button" className="btn-ghost h-8 px-2 text-xs" onClick={() => onDateChange(shiftDate(date, -1))} aria-label="Previous day">
              ←
            </button>
            <input
              type="date"
              value={date}
              max={today}
              onChange={(e) => e.target.value && onDateChange(e.target.value)}
              className="h-8 rounded-md border border-line bg-card px-2 text-xs text-ink-900"
              aria-label="Day"
            />
            <button
              type="button"
              className="btn-ghost h-8 px-2 text-xs"
              onClick={() => onDateChange(shiftDate(date, 1))}
              disabled={date >= today}
              aria-label="Next day"
            >
              →
            </button>
          </div>
        }
      />
      <CardBody>
        {query.error ? (
          <p className="hint">Could not load this day.</p>
        ) : !d || !t ? (
          <ChartSkeleton height={300} />
        ) : (
          <>
            <div className="mb-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4 xl:grid-cols-8">
              <Stat label="Started" value={d.firstActivityAt ? clockIn(d.firstActivityAt, d.timezone) : "—"} hint="First agent activity of the day" />
              <Stat label="Last activity" value={d.lastActivityAt ? clockIn(d.lastActivityAt, d.timezone) : "—"} hint="When the last agent activity ended" />
              <Stat label="Working with AI" value={formatDuration(t.workingMs)} hint={WORKDAY_SERIES[0].hint} />
              <Stat label="AI active" value={formatDuration(t.activeMs)} hint={WORKDAY_SERIES[1].hint} />
              <Stat label={WORKDAY_SERIES[2].label} value={formatDuration(t.idleMs)} hint={WORKDAY_SERIES[2].hint} />
              <Stat label={WORKDAY_SERIES[3].label} value={formatDuration(t.explorationMs)} hint={WORKDAY_SERIES[3].hint} />
              <Stat
                label="Files changed"
                value={formatNumber(t.fileChanges)}
                hint={t.filesTouched ? `${t.filesTouched} distinct files` : "File edits reported by the agents"}
              />
              <Stat label="Sessions" value={`${t.sessions} · ${t.modelRequests} calls`} hint={`${t.modelRequests} model calls, ${t.toolCalls} tool calls`} />
            </div>

            <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-2xs text-ink-700">
              {WORKDAY_SERIES.map((s) => (
                <span key={s.key} className="flex items-center gap-1.5" title={s.hint}>
                  <span
                    className="inline-block h-0.5 w-4 rounded"
                    style={{
                      background: "dash" in s ? `repeating-linear-gradient(90deg, ${s.color} 0 4px, transparent 4px 7px)` : s.color,
                    }}
                  />
                  {s.label}
                </span>
              ))}
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "var(--chart-5)", opacity: 0.45 }} />
                Files changed
              </span>
              {d.coverageGaps.length ? (
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "rgb(var(--state-warn))", opacity: 0.3 }} />
                  Not collecting
                </span>
              ) : null}
              {d.providers.length ? (
                <span className="ml-auto flex items-center gap-1">
                  {d.providers.map((p) => (
                    <ProviderBadge key={p} provider={p} size="sm" />
                  ))}
                </span>
              ) : null}
            </div>

            <WorkdayChart data={d} />

            {d.periods.length || d.coverageGaps.length ? (
              <div className="mt-4 grid gap-4 border-t border-line pt-4 md:grid-cols-3">
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-ink-900">Worked with AI</p>
                  <ul className="space-y-1 text-xs text-ink-700">
                    {d.periods.map((p) => (
                      <li key={p.start} className="num flex justify-between gap-2">
                        <span>
                          {clockIn(p.start, d.timezone)} – {clockIn(p.end, d.timezone)}
                        </span>
                        <span className="text-ink-500">{formatDuration(p.ms)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-ink-900">Breaks (no agent activity)</p>
                  {d.breaks.length === 0 ? (
                    <p className="hint">None</p>
                  ) : (
                    <ul className="space-y-1 text-xs text-ink-700">
                      {d.breaks.map((b) => (
                        <li key={b.start} className="num flex justify-between gap-2">
                          <span>
                            {clockIn(b.start, d.timezone)} – {clockIn(b.end, d.timezone)}
                          </span>
                          <span className="text-ink-500">{formatDuration(b.ms)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-ink-900">Not collecting</p>
                  {d.coverageGaps.length === 0 ? (
                    <p className="hint">Connector collected all day</p>
                  ) : (
                    <ul className="space-y-1 text-xs text-amber-800 dark:text-amber-200">
                      {d.coverageGaps.map((g) => (
                        <li key={g.start} className="num flex justify-between gap-2">
                          <span>
                            {clockIn(g.start, d.timezone)} – {g.end ? clockIn(g.end, d.timezone) : "still"}
                          </span>
                          <span>{g.reason === "paused" ? "paused" : g.reason === "stopped" ? "stopped by employee" : "offline"}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ) : null}
            <p className="mt-3 text-2xs leading-relaxed text-ink-400">
              Measures work done with AI agents only. A break means no agent activity — manual coding,
              meetings, and reviews are not visible here, and “Not collecting” periods are unknown, not idle.
            </p>
          </>
        )}
      </CardBody>
    </Card>
  );
}
