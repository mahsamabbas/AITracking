"use client";

import { useChartAnimation } from "@/lib/use-reduced-motion";
import { Bar, BarChart, CartesianGrid, Cell, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS, ChartFrame, GRID, TooltipShell, durationTicks } from "./ChartFrame";
import { formatDuration } from "@/lib/format";
import type { HourPattern } from "@/lib/types";
import type { EmptyVariant } from "@/components/ui/States";

/** Working-hour pattern — when agent activity actually happens, org timezone. */
export function HourPatternChart({
  data,
  height = 200,
  emptyVariant = "no-activity",
}: {
  data: HourPattern[];
  height?: number;
  emptyVariant?: EmptyVariant;
}) {
  const anim = useChartAnimation();
  const max = Math.max(...data.map((d) => d.activeMs), 0);
  return (
    <ChartFrame height={height} minWidth={420} isEmpty={max === 0} emptyVariant={emptyVariant}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid {...GRID} />
        <XAxis
          dataKey="hour"
          {...AXIS}
          interval={2}
          tickFormatter={(h: number) => `${String(h).padStart(2, "0")}`}
        />
        <YAxis
          {...AXIS}
          width={44}
          tickFormatter={durationTicks(max)}
          allowDecimals={false}
        />
        <Tooltip
          cursor={{ fill: "rgba(99,102,241,0.06)" }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <TooltipShell
                title={`${String(payload[0]?.payload.hour).padStart(2, "0")}:00`}
                rows={[
                  {
                    label: "Agent active",
                    value: formatDuration(Number(payload[0]?.payload.activeMs)),
                    color: "var(--chart-1)",
                  },
                  { label: "Sessions", value: String(payload[0]?.payload.sessions ?? 0) },
                ]}
              />
            ) : null
          }
        />
        <Bar {...anim} dataKey="activeMs" radius={[3, 3, 0, 0]}>
          {data.map((d) => (
            <Cell
              key={d.hour}
              fill={
                d.activeMs > max * 0.6
                  ? "var(--chart-1)"
                  : d.activeMs > max * 0.25
                    ? "var(--chart-1)"
                    : "var(--chart-soft)"
              }
              fillOpacity={d.activeMs > max * 0.6 ? 1 : d.activeMs > max * 0.25 ? 0.7 : 1}
            />
          ))}
        </Bar>
      </BarChart>
    </ChartFrame>
  );
}
