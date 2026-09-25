"use client";

import { ResponsiveContainer } from "recharts";
import { EmptyState } from "@/components/ui/States";
import type { EmptyVariant } from "@/components/ui/States";

export function ChartFrame({
  height = 240,
  fill,
  isEmpty,
  emptyVariant = "no-activity",
  emptyTitle,
  emptyBody,
  children,
}: {
  height?: number;
  /** Grow to fill the parent flex/grid cell (use with a sized parent). */
  fill?: boolean;
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
        style={fill ? { minHeight: emptyMin, height: "100%" } : { minHeight: height }}
        className="flex w-full items-center justify-center"
      >
        <EmptyState compact variant={emptyVariant} title={emptyTitle} body={emptyBody} />
      </div>
    );
  }
  return (
    <div
      // Fixed height by default (charts nested in wrappers need a definite
      // height). `chart-fill` + globals.css let a chart that is the direct child
      // of a card body grow to fill a stretched card — never below this height.
      style={fill ? { minHeight: emptyMin, height: "100%" } : ({ height, "--chart-h": `${height}px` } as React.CSSProperties)}
      className="chart-fill w-full"
    >
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
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
