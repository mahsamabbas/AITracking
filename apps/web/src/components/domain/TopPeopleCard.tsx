"use client";

import { OrgLink } from "@/components/OrgLink";
import { UserAvatar } from "@/components/UserAvatar";
import { Sparkline } from "@/components/charts/Sparkline";
import { Card, CardHeader } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/States";
import { rangeParams, type RangeValue } from "@/components/filters/RangePicker";
import { qs } from "@/lib/api";
import { formatDuration, formatNumber } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import type { EmployeeRow } from "@/lib/types";

/**
 * Most AI-active people in the period — a shortcut into profiles, not a
 * ranking of effort (the full, explained view lives on Leaderboard).
 */
export function TopPeopleCard({
  range,
  team,
  provider,
  limit = 5,
}: {
  range: RangeValue;
  team?: string;
  provider?: string;
  limit?: number;
}) {
  const query = useApi<{ employees: EmployeeRow[] }>(
    `/v1/employees${qs({ ...rangeParams(range), team, provider, sort: "activity" })}`,
  );
  const rows = (query.data?.employees ?? [])
    .filter((e) => e.activeMs > 0)
    .sort((a, b) => b.activeMs - a.activeMs)
    .slice(0, limit);
  const max = Math.max(...rows.map((r) => r.activeMs), 1);

  return (
    <Card>
      <CardHeader
        icon="trophy"
        tone="amber"
        title="Most AI activity"
        subtitle="People whose agents were most active"
        href="/leaderboard"
        hrefLabel="Leaderboard"
      />
      <div className="card-body">
        {query.loading ? (
          <ul className="space-y-3 p-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <li key={i} className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <Skeleton className="h-3 flex-1" />
              </li>
            ))}
          </ul>
        ) : rows.length === 0 ? (
          <p className="hint p-5 text-center">No agent activity in this period.</p>
        ) : (
          <ol className="divide-y divide-line">
            {rows.map((r, i) => (
              <li key={r.id}>
                <OrgLink
                  href={`/employees/${r.id}`}
                  className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-slate-50 dark:hover:bg-white/5"
                >
                  <span className="num w-4 shrink-0 text-xs font-semibold text-ink-400">{i + 1}</span>
                  <UserAvatar name={r.displayName} src={r.avatarUrl} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink-900">{r.displayName}</span>
                    <span className="mt-1 block h-1 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                      <span
                        className="block h-full rounded-full bg-brand-500"
                        style={{ width: `${Math.max(4, (r.activeMs / max) * 100)}%` }}
                      />
                    </span>
                  </span>
                  <span className="hidden shrink-0 sm:block">
                    <Sparkline points={r.trend.map((p) => p.activeMs)} width={56} height={20} />
                  </span>
                  <span className="w-16 shrink-0 text-right">
                    <span className="num block text-sm font-semibold text-ink-900">
                      {formatDuration(r.activeMs, { compact: true })}
                    </span>
                    <span className="num block text-2xs text-ink-500">{formatNumber(r.sessions)} sess.</span>
                  </span>
                </OrgLink>
              </li>
            ))}
          </ol>
        )}
      </div>
    </Card>
  );
}
