import { formatDuration, formatTime } from "@/lib/format";
import { ACTIVITY_TYPE, eventLabel } from "@/lib/vocab";
import type { ActivityEventRow } from "@/lib/types";
import { EmptyState } from "@/components/ui/States";

function metaSummary(e: ActivityEventRow): string | null {
  const m = e.metadata ?? {};
  const parts: string[] = [];
  if (m.model_name) parts.push(String(m.model_name));
  if (m.tool_category) parts.push(String(m.tool_category));
  if (m.path_category) parts.push(String(m.path_category));
  if (m.test_passed != null) {
    parts.push(`${m.test_passed} passed${m.test_failed ? `, ${m.test_failed} failed` : ""}`);
  }
  if (m.token_input != null) {
    parts.push(`${Number(m.token_input).toLocaleString()} in / ${Number(m.token_output ?? 0).toLocaleString()} out tokens`);
  }
  if (m.gap_reason) parts.push(`reason: ${m.gap_reason}`);
  return parts.length ? parts.join(" · ") : null;
}

/** Chronological source-event trail (FR-025 — every metric traces back here). */
export function EventTimeline({
  events,
  limit,
  emptyBody,
  scroll = true,
}: {
  events: ActivityEventRow[];
  limit?: number;
  emptyBody?: string;
  /** Vertical scroll when the list is long (default on). */
  scroll?: boolean;
}) {
  const shown = limit ? events.slice(0, limit) : events;
  if (shown.length === 0) {
    return <EmptyState compact variant="no-activity" body={emptyBody} />;
  }
  const list = (
    <ol className="relative space-y-0">
      {shown.map((e, i) => {
        const type = e.activity_type ?? "connector";
        const tone = ACTIVITY_TYPE[type] ?? ACTIVITY_TYPE.connector;
        const failed = e.status === "failed";
        const summary = metaSummary(e);
        return (
          <li key={e.event_id ?? i} className="relative flex gap-3 py-2.5">
            <div className="flex flex-col items-center">
              <span
                className="mt-1.5 h-2 w-2 shrink-0 rounded-full ring-2 ring-card"
                style={{ background: failed ? "var(--chart-4)" : tone.color }}
              />
              {i < shown.length - 1 ? (
                <span className="mt-1 w-px flex-1 bg-line" aria-hidden />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="num text-xs text-ink-400">{formatTime(e.occurred_at)}</span>
                <span className="text-sm font-medium text-ink-900">
                  {eventLabel(e.event_type)}
                </span>
                {e.duration_ms ? (
                  <span className="num text-xs text-ink-500">
                    {formatDuration(e.duration_ms)}
                  </span>
                ) : null}
                {failed ? (
                  <span className="badge-bad">failed</span>
                ) : null}
                {e.late ? (
                  <span
                    className="badge-warn"
                    title={`Received ${e.received_at ? new Date(e.received_at).toLocaleString() : "later"} — after an outage or offline period. Hourly figures were recalculated as a new version.`}
                  >
                    arrived late
                  </span>
                ) : null}
              </div>
              {summary ? <p className="hint truncate">{summary}</p> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
  if (!scroll || shown.length <= 6) return list;
  return <div className="scroll-y pr-1">{list}</div>;
}
