import { Card, CardHeader } from "@/components/ui/Card";
import { formatNumber } from "@/lib/format";
import type { CommitSummary } from "@/lib/types";

/** Where the commits landed: per-repository commits with the shipped share. */
export function RepositoriesCard({ repos }: { repos: CommitSummary["repos"] }) {
  const rows = [...repos].sort((a, b) => b.commits - a.commits).slice(0, 8);
  const max = Math.max(...rows.map((r) => r.commits), 1);
  return (
    <Card>
      <CardHeader
        icon="repo"
        tone="sky"
        title="Repositories"
        subtitle="Commits per repo · shipped share in teal"
        help="Repositories where an AI agent worked and the connector saw commits. Only the folder name and counts are collected — never code or commit messages."
      />
      <div className="card-body p-5">
        {rows.length === 0 ? (
          <p className="hint py-6 text-center">No commits in this period.</p>
        ) : (
          <ul className={`space-y-3.5 ${rows.length > 6 ? "scroll-y-sm pr-1" : ""}`}>
            {rows.map((r) => {
              const shippedPct = r.commits ? Math.round((r.shipped / r.commits) * 100) : 0;
              return (
                <li key={r.name}>
                  <div className="mb-1 flex items-baseline justify-between gap-3">
                    <span className="truncate font-mono text-[13px] text-ink-900">{r.name}</span>
                    <span className="num shrink-0 text-xs text-ink-500">
                      <span className="font-semibold text-ink-900">{formatNumber(r.commits)}</span> commits ·{" "}
                      {shippedPct}% shipped
                    </span>
                  </div>
                  {/* Track = commits relative to the busiest repo; fill = shipped part. */}
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                    <div className="flex h-full" style={{ width: `${Math.max(4, (r.commits / max) * 100)}%` }}>
                      <div className="h-full bg-[var(--chart-2)]" style={{ width: `${shippedPct}%` }} />
                      <div className="h-full flex-1 bg-[var(--chart-4)] opacity-40" />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}
