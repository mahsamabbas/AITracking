import Link from "next/link";

export function Skeleton({ className = "h-4 w-full" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}

export function LoadingBlock({
  rows = 3,
  label = "Loading",
}: {
  rows?: number;
  label?: string;
}) {
  return (
    <div className="space-y-2.5 p-5" role="status" aria-label={label}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className={`h-4 ${i === 0 ? "w-1/3" : "w-full"}`} />
      ))}
    </div>
  );
}

export function StatSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card-pad space-y-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-20" />
          <Skeleton className="h-3 w-32" />
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton({ height = 220 }: { height?: number }) {
  return (
    <div className="p-5">
      <div className="skeleton w-full" style={{ height }} aria-hidden />
    </div>
  );
}

/**
 * The PRD requires these to stay distinguishable: "no activity observed" is not
 * the same as "connector offline", "collection paused", or "not available from
 * provider". Every empty surface picks an explicit variant.
 */
export type EmptyVariant =
  | "no-activity"
  | "no-results"
  | "connector-offline"
  | "paused"
  | "provider-missing"
  | "delayed"
  | "unassigned"
  | "no-employees"
  | "no-permission";

export function emptyActivityVariant(
  connectors: { state?: string }[],
): "no-activity" | "paused" | "connector-offline" {
  const live = connectors;
  const pool = live.length > 0 ? live : connectors;
  if (pool.some((c) => c.state === "online" || c.state === "stale")) {
    return "no-activity";
  }
  if (pool.some((c) => c.state === "paused")) return "paused";
  return "connector-offline";
}

const EMPTY_COPY: Record<EmptyVariant, { title: string; body: string }> = {
  "no-activity": {
    title: "No activity observed",
    body: "The connector reported in, but no agent sessions happened in this period. That describes the agent, not the person — planning, review, and manual coding are invisible here.",
  },
  "no-results": {
    title: "No matches",
    body: "No records match the current filters. Try widening the date range or clearing a filter.",
  },
  "connector-offline": {
    title: "Connector offline",
    body: "No telemetry was received. Signing in does not collect activity — the workstation connector and IDE companion must be running. Missing telemetry is not evidence of inactivity.",
  },
  paused: {
    title: "Collection paused",
    body: "Collection was paused for this period. A coverage gap is recorded instead of a silent blank.",
  },
  "provider-missing": {
    title: "Not available from provider",
    body: "This AI tool does not expose the metric. The value is unavailable — it is not zero.",
  },
  delayed: {
    title: "Events delayed",
    body: "Telemetry is arriving late. Figures may change when the queue drains.",
  },
  unassigned: {
    title: "No task selected",
    body: "Activity in this period was not linked to a project or work item.",
  },
  "no-employees": {
    title: "No employees yet",
    body: "An administrator adds people under Access and issues each one a connector key. Nothing appears here until a real connector reports in.",
  },
  "no-permission": {
    title: "Outside your access",
    body: "Your role does not include this view. Developers see their own activity; auditors see access history and configuration.",
  },
};

export function EmptyState({
  variant = "no-activity",
  title,
  body,
  action,
  compact = false,
}: {
  variant?: EmptyVariant;
  title?: string;
  body?: string;
  action?: React.ReactNode;
  compact?: boolean;
}) {
  const copy = EMPTY_COPY[variant];
  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${compact ? "px-5 py-8" : "px-6 py-14"}`}
    >
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-ink-400 dark:bg-white/10">
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
          <circle cx="10" cy="10" r="7.2" />
          <path d="M10 6.4v4.2M10 13.4h.01" strokeLinecap="round" />
        </svg>
      </div>
      <p className="text-sm font-semibold text-ink-900">{title ?? copy.title}</p>
      <p className="hint mt-1 max-w-sm">{body ?? copy.body}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  detail,
  onRetry,
  compact = false,
}: {
  title?: string;
  detail?: string | null;
  onRetry?: () => void;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${compact ? "px-5 py-8" : "px-6 py-12"}`}
      role="alert"
    >
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-300">
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M10 3.2 2.6 16.2h14.8L10 3.2Z" strokeLinejoin="round" />
          <path d="M10 8v3.4M10 14h.01" strokeLinecap="round" />
        </svg>
      </div>
      <p className="text-sm font-semibold text-ink-900">{title}</p>
      {detail ? <p className="hint mt-1 max-w-md">{detail}</p> : null}
      {onRetry ? (
        <button type="button" className="btn-ghost mt-4" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function NotFoundState({ backHref, backLabel }: { backHref: string; backLabel: string }) {
  return (
    <div className="card">
      <EmptyState
        title="Not found"
        body="This record no longer exists, or it is outside your access scope."
        action={
          <Link href={backHref} className="btn-ghost">
            {backLabel}
          </Link>
        }
      />
    </div>
  );
}
