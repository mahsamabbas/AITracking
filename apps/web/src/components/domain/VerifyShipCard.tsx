"use client";

import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/States";
import { formatNumber, formatRelative } from "@/lib/format";
import type { CommitSummary } from "@/lib/types";

function Stage({
  label,
  value,
  of,
  hint,
  color,
}: {
  label: string;
  value: number;
  of?: number;
  hint: string;
  color: string;
}) {
  const pct = of ? Math.round((value / of) * 100) : null;
  return (
    <div className="min-w-0 rounded-lg border border-line bg-card px-4 py-3" title={hint}>
      <p className="label">{label}</p>
      <p className="num mt-1 text-2xl font-semibold text-ink-900">{formatNumber(value)}</p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
        <div className="h-full rounded-full" style={{ width: `${pct ?? 100}%`, background: color }} />
      </div>
      <p className="hint mt-1">{pct == null ? hint : `${pct}% of commits`}</p>
    </div>
  );
}

function StateChip({ verified, shipped }: { verified: boolean; shipped: boolean }) {
  return (
    <span className="flex flex-wrap items-center gap-1 text-2xs">
      <span className="badge-neutral">Committed</span>
      <span aria-hidden className="text-ink-400">→</span>
      <span className={verified ? "badge-ok" : "badge-neutral opacity-60"} title={verified ? "A passing check ran in this repo before the commit" : "No passing check was observed before this commit"}>
        {verified ? "Verified" : "Not verified"}
      </span>
      <span aria-hidden className="text-ink-400">→</span>
      <span className={shipped ? "badge-ok" : "badge-neutral opacity-60"} title={shipped ? "The commit reached the remote (pushed)" : "Not pushed yet"}>
        {shipped ? "Shipped" : "Not shipped"}
      </span>
    </span>
  );
}

/**
 * Commit → Verified → Shipped. Commits come from the connector's local git
 * watcher (counts only), in repos the AI agents work in; "verified" means a
 * passing check ran first, "shipped" that the commit reached the remote.
 */
export function VerifyShipCard({
  commits,
  showPerson = false,
  compact = false,
}: {
  commits: CommitSummary;
  showPerson?: boolean;
  /** Narrow column next to a chart: shorter copy, list scrolls inside the card. */
  compact?: boolean;
}) {
  return (
    <Card>
      <CardHeader
        title="Verify & ship"
        subtitle={
          compact
            ? "Commits in the repos agents work in → shipped (pushed)"
            : "Commits in the repositories the AI agents work in: committed → verified (a passing check ran first) → shipped (pushed)"
        }
      />
      <CardBody>
        {commits.commits === 0 ? (
          <EmptyState
            compact
            title="No commits in this period"
            body="Commits made in a repository an AI agent works in appear here within a minute, with whether they were verified and shipped. Only counts are collected — never commit messages or code."
          />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Stage label="Committed" value={commits.commits} hint="Commits by the tracked people" color="var(--chart-4)" />
              <Stage label="Shipped" value={commits.shipped} of={commits.commits} hint="Pushed to the remote" color="var(--chart-2)" />
            </div>
            <p className="hint mt-3">
              {formatNumber(commits.filesChanged)} files · +{formatNumber(commits.linesAdded)} / −
              {formatNumber(commits.linesDeleted)} lines across these commits
              {commits.repos.length ? ` · ${commits.repos.map((r) => `${r.name} (${r.commits})`).join(", ")}` : ""}
            </p>
            <div className={`mt-4 rounded-lg border border-line ${compact ? "max-h-[220px] overflow-y-auto" : "scroll-y-sm"}`}>
              <ul className="divide-y divide-line">
                {commits.recent.map((c) => (
                  <li key={c.ref} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5">
                    <span className="num w-24 shrink-0 text-xs text-ink-500">{formatRelative(c.occurredAt)}</span>
                    {showPerson ? (
                      <Link href={`/employees/${c.developerId}`} className="text-sm font-medium text-ink-900 hover:text-brand-600">
                        {c.developerName ?? "Unknown"}
                      </Link>
                    ) : null}
                    <span className="min-w-0 truncate text-sm text-ink-700">{c.repo ?? "Repository"}</span>
                    <span className="num text-xs text-ink-500">
                      {c.filesChanged} files · +{c.linesAdded} / −{c.linesDeleted}
                    </span>
                    <span className="ml-auto">
                      <StateChip verified={c.verified} shipped={Boolean(c.shippedAt)} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}
