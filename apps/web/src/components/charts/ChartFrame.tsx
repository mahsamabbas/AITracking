"use client";

import { ResponsiveContainer } from "recharts";
import { EmptyState } from "@/components/ui/States";
import type { EmptyVariant } from "@/components/ui/States";

export function ChartFrame({
  height = 240,
  fill,
  minWidth,
  isEmpty,
  emptyVariant = "no-activity",
  emptyTitle,
  emptyBody,
  children,
}: {
  height?: number;
  /** Grow to fill the parent flex/grid cell (use with a sized parent). */
  fill?: boolean;
  /**
   * Narrowest width the chart stays readable at on phones and tablets. Below
   * it the chart scrolls sideways instead of squeezing its bars and labels
   * together; on desktop (lg+) charts always fit their card.
   */
  minWidth?: number;
  isEmpty?: boolean;
  emptyVariant?: EmptyVariant;
  emptyTitle?: string;
  emptyBody?: string;
  children: React.ReactElement;
}) {
  const emptyMin = fill ? Math.max(height, 220) : height;
  if (isEmpty) {
    return (
      <div
        className={
          fill
            ? "chart-fill flex w-full items-center justify-center"
            : "flex w-full items-center justify-center"
        }
        style={fill ? { minHeight: emptyMin, height: "100%" } : { minHeight: height }}
      >
        <EmptyState compact variant={emptyVariant} title={emptyTitle} body={emptyBody} />
      </div>
    );
  }
  // The chart is drawn in an absolutely positioned layer, so it always fills
  // the frame: its own height by default, or all the room its card gives it
  // when the card is stretched beside a taller one (no blank band below).
  const minH = fill ? emptyMin : height;
  const chart = (
    <ResponsiveContainer width="100%" height="100%">
      {children}
    </ResponsiveContainer>
  );
  return (
    <div
      className="chart-fill relative w-full"
      style={{ minHeight: minH, "--chart-h": `${minH}px` } as React.CSSProperties}
    >
      <div className="absolute inset-0 flex flex-col">
        {minWidth ? (
          <>
            <div className="chart-scroll" tabIndex={0} role="region" aria-label="Chart (scrolls sideways on small screens)">
              <div className="chart-min h-full" style={{ "--chart-min": `${minWidth}px` } as React.CSSProperties}>
                {chart}
              </div>
            </div>
            <p className="chart-scroll-hint" aria-hidden>
              Swipe sideways to see the whole chart
            </p>
          </>
        ) : (
          chart
        )}
      </div>
    </div>
  );
}

export function trendMinWidth(points: number): number | undefined {
  return points <= 10 ? undefined : Math.min(900, points * 20);
}

export const AXIS = {
  tick: { fontSize: 11, fill: "var(--chart-axis)" },
  axisLine: false as const,
  tickLine: false as const,
};

export const GRID = {
  stroke: "var(--chart-grid)",
  strokeDasharray: "0",
  vertical: false as const,
};

export function TooltipShell({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: string; color?: string }[];
}) {
  return (
    <div className="rounded-lg border border-line bg-card px-3 py-2 text-xs shadow-pop">
      <p className="mb-1 font-semibold text-ink-900">{title}</p>
      <ul className="space-y-0.5">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-2">
            {r.color ? (
              <span
                className="h-2 w-2 shrink-0 rounded-[2px]"
                style={{ background: r.color }}
              />
            ) : null}
            <span className="text-ink-500">{r.label}</span>
            <span className="num ml-auto font-medium text-ink-900">{r.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Duration axis ticks that adapt to the range, so a 90-minute chart does not
 * render as "1h, 1h, 2h" with duplicate labels.
 */
export function durationTicks(maxMs: number): (v: number) => string {
  if (maxMs >= 4 * 3_600_000) {
    return (v) => `${Math.round(v / 3_600_000)}h`;
  }
  if (maxMs >= 3_600_000) {
    return (v) => {
      const h = v / 3_600_000;
      return h % 1 === 0 ? `${h}h` : `${h.toFixed(1)}h`;
    };
  }
  return (v) => `${Math.round(v / 60_000)}m`;
}

export interface LegendItem {
  label: string;
  color: string;
  /** "line" for line/area series, "bar" (default) for bars and areas. */
  shape?: "line" | "bar";
}

/** Compact series legend, typically placed in a card header's action slot. */
export function ChartLegend({ items }: { items: LegendItem[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-ink-700">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className={i.shape === "line" ? "h-0.5 w-3.5 rounded" : "h-2.5 w-2.5 rounded-[3px]"}
            style={{ background: i.color }}
          />
          {i.label}
        </li>
      ))}
    </ul>
  );
}
