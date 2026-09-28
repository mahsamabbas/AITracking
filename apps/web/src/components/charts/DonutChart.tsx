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
  const pieData = data.filter((d) => d.value > 0);
  const pieTotal = pieData.reduce((s, d) => s + d.value, 0);
  return (
    <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative mx-auto w-full min-w-0 max-w-[280px] flex-1 sm:mx-0 sm:min-w-[160px]">
        <ChartFrame height={height} isEmpty={total === 0} emptyBody={emptyBody} emptyVariant={emptyVariant}>
          <PieChart>
            <Pie {...anim}
              data={pieData}
              dataKey="value"
              nameKey="name"
              innerRadius="62%"
              outerRadius="92%"
              paddingAngle={pieData.length > 1 ? 2 : 0}
              stroke="none"
            >
              {pieData.map((d, i) => (
                <Cell key={d.name} fill={d.color ?? CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) =>
                active && payload?.length && pieTotal > 0 ? (
                  <TooltipShell
                    title={String(payload[0]?.name)}
                    rows={[
                      {
                        label: "Share",
                        value: `${Math.round(((payload[0]?.value as number) / pieTotal) * 100)}%`,
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
      {total > 0 || data.some((d) => d.value === 0) ? (
        // Legend wraps under the donut in narrow cards instead of truncating names.
        <ul
          className={`w-full min-w-0 space-y-2 sm:min-w-[210px] sm:flex-1 ${data.length > 8 ? "scroll-y-sm pr-1" : ""}`}
        >
          {data.map((d, i) => {
            const color = d.color ?? CHART_COLORS[i % CHART_COLORS.length];
            const share = total > 0 ? Math.round((d.value / total) * 100) : 0;
            return (
              <li key={d.name} className={d.value === 0 ? "opacity-55" : ""}>
                <div className="flex items-center gap-2 text-xs">
                  <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: color }} />
                  <span className="min-w-0 flex-1 text-ink-700">{d.name}</span>
                  <span className="num whitespace-nowrap font-medium text-ink-900">{d.formatted ?? d.value}</span>
                  <span className="num w-9 shrink-0 text-right text-2xs text-ink-500">{share}%</span>
                </div>
                <div className="ml-4 mt-1 h-1 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                  <div className="h-full rounded-full" style={{ width: `${share}%`, background: color }} />
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
