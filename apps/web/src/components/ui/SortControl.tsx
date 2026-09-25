"use client";

import type { ActivityEventRow } from "@/lib/types";

export type SortDirection = "asc" | "desc";

/** Visible ↑ / ↓ when active; neutral ↕ when inactive. */
export function SortIcon({ direction, active }: { direction: SortDirection; active: boolean }) {
  return (
    <span
      aria-hidden
      className={`inline-flex w-3 shrink-0 justify-center text-[11px] leading-none ${
        active ? "text-brand-600" : "text-ink-400"
      }`}
    >
      {!active ? "↕" : direction === "asc" ? "↑" : "↓"}
    </span>
  );
}

export function ListTimeSortButton({
  direction,
  onToggle,
  label = "Time",
}: {
  direction: SortDirection;
  onToggle: () => void;
  label?: string;
}) {
  const orderLabel = direction === "asc" ? "oldest first" : "newest first";
  return (
    <button
      type="button"
      className="btn-ghost ml-auto h-8 shrink-0 gap-1.5 px-2.5 text-xs text-ink-700"
      onClick={onToggle}
      aria-label={`Sort by ${label}, ${orderLabel}`}
    >
      {label}
      <SortIcon direction={direction} active />
    </button>
  );
}

export function sortEventsByTime(
  events: ActivityEventRow[],
  direction: SortDirection,
): ActivityEventRow[] {
  const mul = direction === "asc" ? 1 : -1;
  return [...events].sort(
    (a, b) =>
      mul * a.occurred_at.localeCompare(b.occurred_at) ||
      mul * (a.event_id ?? "").localeCompare(b.event_id ?? ""),
  );
}

export function SortableTh<K extends string>({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
  align = "left",
  defaultDirection = "desc",
  className,
}: {
  label: string;
  sortKey: K;
  activeKey: K;
  direction: SortDirection;
  onSort: (key: K, direction: SortDirection) => void;
  align?: "left" | "right";
  defaultDirection?: SortDirection;
  className?: string;
}) {
  const active = activeKey === sortKey;
  return (
    <th
      aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}
      className={[align === "right" ? "text-right" : undefined, className].filter(Boolean).join(" ")}
    >
      <button
        type="button"
        onClick={() => {
          if (active) onSort(sortKey, direction === "asc" ? "desc" : "asc");
          else onSort(sortKey, defaultDirection);
        }}
        className={`inline-flex items-center gap-1 uppercase tracking-[0.06em] transition-colors duration-fast hover:text-ink-900 ${
          active ? "text-ink-900" : ""
        } ${align === "right" ? "ml-auto" : ""}`}
      >
        {label}
        <SortIcon direction={direction} active={active} />
      </button>
    </th>
  );
}
