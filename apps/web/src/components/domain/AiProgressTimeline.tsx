"use client";

import Link from "next/link";
import { useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/ui/States";
import { formatDuration, formatTime } from "@/lib/format";
import { providerMeta } from "@/lib/providers";
import { classificationOf } from "@/lib/vocab";
import { useApi } from "@/lib/use-api";
import type { ProgressTimeline } from "@/lib/types";

/**
 * "What happened today" — hourly agent activity by provider for one day in the
 * organisation timezone. Bars show counts reported by the API; coverage events
 * are marked separately and are never drawn as low activity.
 */
export function AiProgressTimeline({ employeeId }: { employeeId: string }) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const q = useApi<ProgressTimeline>(`/v1/employees/${employeeId}/ai-progress/timeline?date=${date}`);
  const d = q.data;

  const totals = d?.hours.map((h) =>
    Object.values(h.byProvider).reduce((s, b) => s + b.modelRequests + b.toolCalls + b.fileChanges + b.checks, 0),
  );
  const max = Math.max(1, ...(totals ?? [0]));
  const providers = d ? [...new Set(d.hours.flatMap((h) => Object.keys(h.byProvider)))] : [];

  return (
    <Card>
      <CardHeader
        title="Day timeline"
        subtitle={`Agent actions per hour by AI tool${d ? ` · times in ${d.timezone}` : ""}`}
        action={
          <label className="flex items-center gap-1.5 text-xs text-ink-500">
            <span className="sr-only">Day</span>
            <input
              type="date"
              className="field h-8 w-[150px] text-xs"
              value={date}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => e.target.value && setDate(e.target.value)}
            />
          </label>
        }
      />
      {q.error ? (
        <ErrorState compact title="Could not load the timeline" detail={q.error} onRetry={q.reload} />
      ) : q.loading || !d ? (
        <LoadingBlock rows={3} />
      ) : d.sessions.length === 0 && totals?.every((t) => t === 0) ? (
        <EmptyState
          compact
          variant={d.hours.some((h) => h.coverageEvents > 0) ? "paused" : "no-activity"}
        />
      ) : (
        <CardBody className="space-y-4">
          <div>
            <div className="flex h-24 items-end gap-[3px]" role="img" aria-label="Agent actions per hour">
              {d.hours.map((h, i) => (
                <div key={h.hour} className="flex h-full flex-1 flex-col justify-end" title={hourTitle(h)}>
                  {providers.map((p) => {
                    const b = h.byProvider[p];
                    if (!b) return null;
                    const v = b.modelRequests + b.toolCalls + b.fileChanges + b.checks;
                    return (
                      <div
                        key={p}
                        className="w-full first:rounded-t-[2px]"
                        style={{ height: `${(v / max) * 100}%`, background: providerMeta(p).color }}
                      />
                    );
                  })}
                  {h.coverageEvents > 0 ? (
                    <div className="mt-0.5 h-1 w-full rounded-full bg-conn-warn" aria-hidden />
                  ) : null}
                  {totals?.[i] === 0 && h.coverageEvents === 0 ? (
                    <div className="h-px w-full bg-line" aria-hidden />
                  ) : null}
                </div>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-2xs text-ink-400">
              {[0, 6, 12, 18, 23].map((h) => (
                <span key={h}>{String(h).padStart(2, "0")}:00</span>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-2xs text-ink-500">
              {providers.map((p) => (
                <span key={p} className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-[2px]" style={{ background: providerMeta(p).color }} />
                  {providerMeta(p).label}
                </span>
              ))}
              <span className="flex items-center gap-1">
                <span className="h-1 w-2 rounded-full bg-conn-warn" /> Coverage gap / pause
              </span>
            </div>
          </div>

          {d.sessions.length ? (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {d.sessions.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/sessions/${s.id}`}
                    className="flex items-center gap-3 px-3 py-2 text-sm transition-colors duration-fast hover:bg-slate-50 dark:hover:bg-white/5"
                  >
                    <span className="num w-24 shrink-0 text-xs text-ink-500">
                      {formatTime(s.startedAt, d.timezone)}–{s.endedAt ? formatTime(s.endedAt, d.timezone) : "now"}
                    </span>
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: providerMeta(s.provider).color }} />
                    <span className="min-w-0 flex-1 truncate text-ink-900">{providerMeta(s.provider).label}</span>
                    <span className="hint shrink-0">{classificationOf(s.classification).label}</span>
                    <span className="num w-14 shrink-0 text-right text-xs text-ink-700">{formatDuration(s.activeMs)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </CardBody>
      )}
    </Card>
  );
}

function hourTitle(h: ProgressTimeline["hours"][number]): string {
  const parts = Object.entries(h.byProvider).map(
    ([p, b]) =>
      `${providerMeta(p).label}: ${b.modelRequests} model, ${b.toolCalls} tool, ${b.fileChanges} file, ${b.checks} checks${b.failures ? `, ${b.failures} failed` : ""}`,
  );
  if (h.coverageEvents) parts.push(`${h.coverageEvents} coverage event(s)`);
  return `${String(h.hour).padStart(2, "0")}:00 — ${parts.join("; ") || "no agent activity observed"}`;
}
