"use client";

import { useChartAnimation } from "@/lib/use-reduced-motion";
import { useMemo } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AXIS, ChartFrame, GRID, TooltipShell, durationTicks } from "./ChartFrame";
import { formatDate, formatDuration, formatNumber } from "@/lib/format";
import type { ChangeTrendPoint } from "@/lib/types";

type Point = ChangeTrendPoint & { activeMs?: number };

/**
 * Daily agent file changes, commits (bars — with verified/shipped in the
 * tooltip), and optional AI active time, all from the same events and days.
 */
export function ChangeTrendChart({
  data,
  aiUsageByDay,
  height = 260,
  fill,
}: {
  data: ChangeTrendPoint[];
  aiUsageByDay?: { date: string; activeMs: number }[];
  height?: number;
  fill?: boolean;
}) {
  const anim = useChartAnimation();
  const merged = useMemo(() => {
    const usage = new Map((aiUsageByDay ?? []).map((d) => [d.date, d.activeMs]));
    return data.map((d) => ({
      ...d,
      activeMs: usage.get(d.date) ?? 0,
    }));
  }, [data, aiUsageByDay]);

  const hasChanges = merged.some((d) => d.fileChanges > 0);
  const hasCommits = merged.some((d) => (d.commits ?? 0) > 0);
  const hasAiUsage = merged.some((d) => (d.activeMs ?? 0) > 0);
  const hasData = hasChanges || hasAiUsage || hasCommits;
  const maxChanges = Math.max(...merged.map((d) => d.fileChanges), 0);
  const maxMs = Math.max(...merged.map((d) => d.activeMs ?? 0), 0);
  const showAi = Boolean(aiUsageByDay?.length);

  return (
    <ChartFrame
      height={height}
      fill={fill}
      isEmpty={!hasData}
      emptyTitle="No AI usage, file changes, or commits in this period"
      emptyBody="Agent active time, agent file edits, and commits in repos the agents work in appear here once the connector reports them."
    >
      <ComposedChart data={merged} margin={{ top: 8, right: showAi ? 44 : 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="gChanges" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.32} />
            <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid {...GRID} />
        <XAxis
          dataKey="date"
          {...AXIS}
          tickFormatter={(v: string) => formatDate(v)}
          minTickGap={24}
        />
        <YAxis
          yAxisId="files"
          {...AXIS}
          width={36}
          allowDecimals={false}
          tickFormatter={(v: number) => formatNumber(v)}
        />
        {showAi ? (
          <YAxis
            yAxisId="ai"
            orientation="right"
            {...AXIS}
            width={44}
            allowDecimals={false}
            tickFormatter={durationTicks(maxMs)}
          />
        ) : null}
        <Tooltip
          cursor={{ stroke: "var(--chart-grid)" }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const row = payload[0]?.payload as Point;
            const rows: { label: string; value: string; color?: string }[] = [
              {
                label: "File changes",
                value: formatNumber(row.fileChanges ?? 0),
                color: "var(--chart-2)",
              },
            ];
            if (hasCommits) {
              rows.push({ label: "Commits", value: formatNumber(row.commits ?? 0), color: "var(--chart-4)" });
              rows.push({ label: "· verified / shipped", value: `${row.verifiedCommits ?? 0} / ${row.shippedCommits ?? 0}` });
              rows.push({ label: "· files in commits", value: formatNumber(row.committedFiles ?? 0) });
            }
            if (showAi) {
              rows.push({
                label: "AI active time",
                value: formatDuration(row.activeMs ?? 0),
                color: "var(--chart-1)",
              });
            }
            return <TooltipShell title={formatDate(String(label))} rows={rows} />;
          }}
        />
        {hasCommits ? (
          <Bar {...anim} yAxisId="files" dataKey="commits" name="Commits" fill="var(--chart-4)" fillOpacity={0.55} radius={[3, 3, 0, 0]} maxBarSize={14} />
        ) : null}
        <Area {...anim}
          yAxisId="files"
          type="monotone"
          dataKey="fileChanges"
          stroke="var(--chart-2)"
          strokeWidth={2}
          fill="url(#gChanges)"
          dot={maxChanges > 0 && merged.length < 16}
        />
        {showAi ? (
          <Line {...anim}
            yAxisId="ai"
            type="monotone"
            dataKey="activeMs"
            stroke="var(--chart-1)"
            strokeWidth={2}
            dot={maxMs > 0 && merged.length < 16}
            activeDot={{ r: 4 }}
          />
        ) : null}
      </ComposedChart>
    </ChartFrame>
  );
}
