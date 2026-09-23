"use client";

import { useChartAnimation } from "@/lib/use-reduced-motion";
import { Cell, Pie, PieChart, Tooltip } from "recharts";
import { ChartFrame, TooltipShell } from "./ChartFrame";
import { CHART_COLORS } from "@/lib/vocab";
import type { EmptyVariant } from "@/components/ui/States";

export interface Slice {
  name: string;
  value: number;
  color?: string;
  formatted?: string;
}

export function DonutChart({
  data,
  height = 200,
  centerLabel,
  centerValue,
  emptyBody,
  emptyVariant = "no-activity",
}: {
  data: Slice[];
  height?: number;
  centerLabel?: string;
  centerValue?: string;
  emptyBody?: string;
  emptyVariant?: EmptyVariant;
}) {
  const anim = useChartAnimation();
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="relative min-w-[160px] flex-1">
        <ChartFrame height={height} isEmpty={total === 0} emptyBody={emptyBody} emptyVariant={emptyVariant}>
          <PieChart>
            <Pie {...anim}
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="62%"
              outerRadius="92%"
              paddingAngle={2}
              stroke="none"
            >
              {data.map((d, i) => (
                <Cell key={d.name} fill={d.color ?? CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <TooltipShell
                    title={String(payload[0]?.name)}
                    rows={[
                      {
                        label: "Share",
                        value: `${Math.round(((payload[0]?.value as number) / total) * 100)}%`,
                      },
                      {
                        label: "Value",
                        value:
                          (payload[0]?.payload as Slice).formatted ??
                          String(payload[0]?.value),
                      },
                    ]}
                  />
                ) : null
              }
            />
          </PieChart>
        </ChartFrame>
        {total > 0 && centerValue ? (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="num text-lg font-semibold text-ink-900">{centerValue}</span>
            {centerLabel ? <span className="text-2xs text-ink-500">{centerLabel}</span> : null}
          </div>
        ) : null}
      </div>
      {total > 0 ? (
        <ul
          className={`min-w-[140px] flex-1 space-y-1.5 ${data.length > 8 ? "scroll-y-sm pr-1" : ""}`}
        >
          {data.map((d, i) => (
            <li key={d.name} className="flex items-center gap-2 text-xs">
              <span
                className="h-2 w-2 shrink-0 rounded-[2px]"
                style={{ background: d.color ?? CHART_COLORS[i % CHART_COLORS.length] }}
              />
              <span className="truncate text-ink-700">{d.name}</span>
              <span className="num ml-auto font-medium text-ink-900">
                {d.formatted ?? d.value}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
