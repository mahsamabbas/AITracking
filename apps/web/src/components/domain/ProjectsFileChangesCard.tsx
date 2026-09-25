"use client";

import { ChangeTrendChart } from "@/components/charts/ChangeTrendChart";
import { BarList } from "@/components/charts/BarList";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { formatDuration, formatNumber } from "@/lib/format";
import type { ChangeTrendPoint, Totals, TrendPoint } from "@/lib/types";

export function ProjectsFileChangesCard({
  trend,
  workspaces,
  dailyUsage,
  totals,
  subtitle,
}: {
  trend: ChangeTrendPoint[];
  workspaces: {
    name: string;
    fileChanges: number;
    sessions: number;
    activeMs: number;
  }[];
  dailyUsage?: TrendPoint[];
  totals?: Pick<Totals, "activeMs" | "sessions" | "fileChanges">;
  subtitle?: string;
}) {
  const aiByDay = dailyUsage?.map((d) => ({ date: d.date, activeMs: d.activeMs }));

  return (
    <Card>
      <CardHeader
        icon="file"
        tone="violet"
        title="File changes & commits"
        subtitle={
          subtitle ??
          "Agent file edits per day, commits made in the repos the agents work in, and AI active time — all from the same tracked events."
        }
      />
      {totals ? (
        <div className="flex flex-wrap gap-x-6 gap-y-1 border-b border-line px-5 py-3 text-xs">
          <span>
            <span className="text-ink-500">AI active time · </span>
            <span className="num font-medium text-ink-900">
              {formatDuration(totals.activeMs)}
            </span>
          </span>
          <span>
            <span className="text-ink-500">Sessions · </span>
            <span className="num font-medium text-ink-900">{formatNumber(totals.sessions)}</span>
          </span>
          <span>
            <span className="text-ink-500">File changes · </span>
            <span className="num font-medium text-ink-900">
              {formatNumber(totals.fileChanges)}
            </span>
          </span>
        </div>
      ) : null}
      <div className="grid gap-0 xl:grid-cols-3 xl:items-stretch">
        <CardBody className="flex min-h-[280px] flex-col pt-2 xl:col-span-2">
          <div className="mb-2 flex flex-wrap gap-4 text-[11px] text-ink-500">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-4 rounded-sm bg-[var(--chart-2)]/40" aria-hidden />
              File changes
            </span>
            {trend.some((d) => (d.commits ?? 0) > 0) ? (
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2.5 rounded-sm bg-[var(--chart-4)]/60" aria-hidden />
                Commits
              </span>
            ) : null}
            {aiByDay ? (
              <span className="flex items-center gap-1.5">
                <span
                  className="h-0.5 w-4 rounded-sm bg-[var(--chart-1)]"
                  aria-hidden
                />
                AI active time
              </span>
            ) : null}
          </div>
          <div className="min-h-0 flex-1">
            <ChangeTrendChart data={trend} aiUsageByDay={aiByDay} fill />
          </div>
        </CardBody>
        <div className="flex min-h-[280px] flex-col border-t border-line xl:border-l xl:border-t-0">
          <CardBody className="flex min-h-0 flex-1 flex-col">
            <p className="label mb-3">Workspaces</p>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain pr-1">
            <BarList
              emptyLabel="No workspace file changes in this period"
              items={workspaces.map((p) => ({
                label: p.name,
                value: p.fileChanges,
                formatted: formatNumber(p.fileChanges),
                meta: [
                  (p.activeMs ?? 0) > 0 ? `${formatDuration(p.activeMs ?? 0)} AI active` : null,
                  `${p.sessions} session${p.sessions === 1 ? "" : "s"}`,
                ]
                  .filter(Boolean)
                  .join(" · "),
                color: "var(--chart-2)",
              }))}
            />
            </div>
          </CardBody>
        </div>
      </div>
    </Card>
  );
}
