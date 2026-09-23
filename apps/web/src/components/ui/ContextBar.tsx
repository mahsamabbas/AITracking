"use client";

import { useEffect, useState } from "react";
import { useApi } from "@/lib/use-api";
import { formatRelative } from "@/lib/format";

/**
 * Persistent "what am I looking at" strip for analytics pages: whose data,
 * which range, which timezone, and when it was fetched. Answers the question
 * "where did this number come from?" before anyone asks it.
 */
export function ContextBar({
  subject,
  rangeLabel,
  fetchedAt,
  live,
  refreshing,
  onRefresh,
}: {
  subject: string;
  rangeLabel: string;
  fetchedAt: Date | null;
  /** Show the Live pill (the page polls /v1/dashboard/live). */
  live?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const policy = useApi<{ timezone?: string }>("/v1/org/policy");
  const tz = policy.data?.timezone ?? "UTC";
  // Re-render every 30s so "updated 2m ago" stays honest without refetching.
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-line bg-card/60 px-3 py-2 text-xs text-ink-500"
      aria-label="Data context"
    >
      <span className="font-medium text-ink-900">{subject}</span>
      <span aria-hidden className="text-ink-400">·</span>
      <span>{rangeLabel}</span>
      <span aria-hidden className="text-ink-400">·</span>
      <span title="Hour and day labels use the organisation timezone. Events are stored in UTC.">
        Times in {tz}
      </span>
      <span className="ml-auto flex items-center gap-2">
        {live ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-2 py-0.5 font-medium text-teal-800 dark:bg-teal-950 dark:text-teal-200">
            <span className="pulse-online h-1.5 w-1.5 rounded-full bg-conn-ok" aria-hidden />
            Live
          </span>
        ) : null}
        <span aria-live="polite">
          {refreshing ? "Refreshing…" : fetchedAt ? `Data as of ${formatRelative(fetchedAt.toISOString())}` : "Loading…"}
        </span>
        {onRefresh ? (
          <button
            type="button"
            className="btn-quiet h-7 px-1.5"
            onClick={onRefresh}
            aria-label="Refresh data"
            title="Refresh now"
            disabled={refreshing}
          >
            <svg
              viewBox="0 0 20 20"
              className={`h-3.5 w-3.5 ${refreshing ? "motion-safe:animate-spin" : ""}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M16 10a6 6 0 1 1-1.8-4.3M16 4v3.5h-3.5" />
            </svg>
          </button>
        ) : null}
      </span>
    </div>
  );
}
