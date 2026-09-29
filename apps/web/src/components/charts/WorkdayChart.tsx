"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useChartAnimation } from "@/lib/use-reduced-motion";
import { AXIS, ChartFrame, GRID, TooltipShell } from "./ChartFrame";
import { formatDuration, formatNumber } from "@/lib/format";
import { WORKDAY_SERIES } from "@/lib/vocab";
import { hour12Preference } from "@/lib/preferences";

export { WORKDAY_SERIES };

/**
 * One day, hour by hour: working span, AI active, idle, exploration, editing
 * (minutes per hour, lines) and file changes (bars, right axis). Coverage gaps
 * are shaded so a paused or offline connector never reads as "no work".
 */

export interface WorkdayHour {
  hour: number;
  workingMs: number;
  activeMs: number;
  idleMs: number;
  explorationMs: number;
  editingMs: number;
  fileChanges: number;
  modelRequests: number;
  toolCalls: number;
}

export interface WorkdayData {
  date: string;
  timezone: string;
  firstActivityAt: string | null;
  lastActivityAt: string | null;
  periods: { start: string; end: string; ms: number }[];
  breaks: { start: string; end: string; ms: number }[];
  coverageGaps: { start: string; end: string | null; reason: string }[];
  hours: WorkdayHour[];
  totals: {
    workingMs: number;
    activeMs: number;
    idleMs: number;
    explorationMs: number;
    editingMs: number;
    fileChanges: number;
    filesTouched: number;
    modelRequests: number;
    toolCalls: number;
    sessions: number;
  };
  providers: string[];
}

const minutes = (ms: number) => Math.round((ms / 60_000) * 10) / 10;

/** Local clock hour label in the organisation timezone. */
export function clockIn(iso: string, timezone: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: hour12Preference(), timeZone: timezone });
}

function hourOf(iso: string, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: timezone })
    .format(new Date(iso))
    .split(":");
  return Number(parts[0]) + Number(parts[1]) / 60;
}

export function WorkdayChart({ data, height = 300 }: { data: WorkdayData; height?: number }) {
  const anim = useChartAnimation();
  const rows = data.hours.map((h) => ({
    ...h,
    label: `${String(h.hour).padStart(2, "0")}:00`,
    workingMin: minutes(h.workingMs),
    activeMin: minutes(h.activeMs),
    idleMin: minutes(h.idleMs),
    explorationMin: minutes(h.explorationMs),
    editingMin: minutes(h.editingMs),
  }));
  const isEmpty = data.totals.workingMs === 0 && data.coverageGaps.length === 0;

  return (
    <ChartFrame
      height={height}
      minWidth={720}
      isEmpty={isEmpty}
      emptyTitle="No agent activity on this day"
      emptyBody="Nothing was observed from Claude Code, Cursor, or other connected agents. Days with the connector paused or offline are marked as coverage gaps instead."
    >
      <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid {...GRID} />
        {data.coverageGaps.map((g, i) => (
          <ReferenceArea
            key={i}
            xAxisId="h"
            yAxisId="min"
            x1={`${String(Math.floor(hourOf(g.start, data.timezone))).padStart(2, "0")}:00`}
            x2={`${String(Math.min(23, Math.floor(hourOf(g.end ?? new Date().toISOString(), data.timezone)))).padStart(2, "0")}:00`}
            fill="rgb(var(--state-warn))"
            fillOpacity={0.08}
            stroke="none"
          />
        ))}
        <XAxis xAxisId="h" dataKey="label" {...AXIS} interval={1} />
        <YAxis
          yAxisId="min"
          {...AXIS}
          width={40}
          domain={[0, 60]}
          ticks={[0, 15, 30, 45, 60]}
          tickFormatter={(v: number) => `${v}m`}
        />
        <YAxis yAxisId="files" orientation="right" {...AXIS} width={28} allowDecimals={false} />
        <Tooltip
          cursor={{ stroke: "var(--chart-grid)" }}
          content={({ active, payload, label }) => {
            const p = active ? (payload?.[0]?.payload as (typeof rows)[number] | undefined) : undefined;
            if (!p) return null;
            return (
              <TooltipShell
                title={`${label} – ${String((p.hour + 1) % 24).padStart(2, "0")}:00`}
                rows={[
                  ...WORKDAY_SERIES.map((s) => ({
                    label: s.label,
                    value: formatDuration(p[s.key]),
                    color: s.color,
                  })),
                  { label: "Files changed", value: formatNumber(p.fileChanges), color: "var(--chart-5)" },
                  { label: "Model calls · tool calls", value: `${p.modelRequests} · ${p.toolCalls}` },
                ]}
              />
            );
          }}
        />
        <Bar
          {...anim}
          xAxisId="h"
          yAxisId="files"
          dataKey="fileChanges"
          name="Files changed"
          fill="var(--chart-5)"
          fillOpacity={0.35}
          radius={[3, 3, 0, 0]}
          maxBarSize={14}
        />
        {WORKDAY_SERIES.map((s) => (
          <Line
            {...anim}
            key={s.key}
            xAxisId="h"
            yAxisId="min"
            type="monotone"
            dataKey={s.key.replace("Ms", "Min")}
            name={s.label}
            stroke={s.color}
            strokeWidth={s.key === "activeMs" ? 2.5 : 1.75}
            strokeDasharray={"dash" in s ? s.dash : undefined}
            dot={false}
            activeDot={{ r: 3 }}
          />
        ))}
      </ComposedChart>
    </ChartFrame>
  );
}
