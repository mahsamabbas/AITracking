"use client";

import { useMemo, useState } from "react";
import { formatDuration, formatNumber } from "@/lib/format";

/**
 * GitHub-style contribution graph of AI agent work: one square per day for the
 * last year, shaded by AI active time. Days before the person's connector was
 * registered are drawn as outlines ("not tracked") — never as zero activity.
 */

export interface ActivityCalendarDay {
  date: string;
  sessions: number;
  activeMs: number;
  modelRequests: number;
  toolCalls: number;
  fileChanges: number;
}

export interface ActivityCalendarData {
  to: string;
  timezone: string;
  trackedSince: string | null;
  days: ActivityCalendarDay[];
  totals: { sessions: number; activeMs: number; activeDays: number };
}

const CELL = 14;
const GAP = 4;
const STEP = CELL + GAP;
const LEFT = 34; // weekday labels
const TOP = 18; // month labels
const WEEKS = 53;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// Opacity steps of the brand colour read correctly in light and dark themes.
const LEVEL_OPACITY = [0, 0.3, 0.5, 0.75, 1];

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Today in the organisation timezone, as a UTC-midnight Date for simple day arithmetic. */
function todayIn(timezone: string, at: string): Date {
  const local = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date(at));
  return new Date(`${local}T00:00:00Z`);
}

export function ActivityCalendar({
  data,
  selected,
  onSelect,
}: {
  data: ActivityCalendarData;
  /** Highlighted day (YYYY-MM-DD). */
  selected?: string;
  /** Called with the day a square was clicked on. */
  onSelect?: (date: string) => void;
}) {
  const [hover, setHover] = useState<{ day: string; x: number; y: number } | null>(null);

  const { cells, months, byDate } = useMemo(() => {
    const byDate = new Map(data.days.map((d) => [d.date, d]));
    // Shade by quartile of this person's own active days, so the graph shows
    // their rhythm rather than comparing them with anyone else.
    const sorted = data.days.map((d) => d.activeMs).filter((v) => v > 0).sort((a, b) => a - b);
    const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0;
    const cuts = [q(0.25), q(0.5), q(0.75)];
    const level = (ms: number) => (ms <= 0 ? 0 : ms <= cuts[0] ? 1 : ms <= cuts[1] ? 2 : ms <= cuts[2] ? 3 : 4);

    const today = todayIn(data.timezone, data.to);
    // Last column is the current week (Sunday-first, like GitHub).
    const start = new Date(today);
    start.setUTCDate(start.getUTCDate() - today.getUTCDay() - (WEEKS - 1) * 7);

    const cells: { date: string; col: number; row: number; level: number; tracked: boolean; future: boolean }[] = [];
    const months: { label: string; col: number }[] = [];
    let lastMonth = -1;
    for (let col = 0; col < WEEKS; col++) {
      for (let row = 0; row < 7; row++) {
        const d = new Date(start);
        d.setUTCDate(start.getUTCDate() + col * 7 + row);
        const date = isoDay(d);
        const future = d > today;
        if (row === 0 && d.getUTCMonth() !== lastMonth && !future) {
          lastMonth = d.getUTCMonth();
          // A partial first month leaves no room for its label; the next one wins.
          if (months.length && col - months[months.length - 1].col < 3) months.pop();
          if (col < WEEKS - 2) months.push({ label: MONTHS[lastMonth], col });
        }
        const tracked = data.trackedSince != null && date >= data.trackedSince;
        cells.push({ date, col, row, future, tracked, level: level(byDate.get(date)?.activeMs ?? 0) });
      }
    }
    return { cells, months, byDate };
  }, [data]);

  const width = LEFT + WEEKS * STEP;
  const height = TOP + 7 * STEP;
  const hovered = hover ? byDate.get(hover.day) : undefined;
  const hoveredTracked = hover ? data.trackedSince != null && hover.day >= data.trackedSince : false;

  return (
    <div className="relative w-full">
      <div className="relative w-full">
        <svg
          className="block h-auto w-full max-w-none"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="xMinYMin meet"
          role="img"
          aria-label={`AI agent activity per day for the last year: ${data.totals.activeDays} active days, ${data.totals.sessions} sessions.`}
          onMouseLeave={() => setHover(null)}
        >
          {months.map((m) => (
            <text key={`${m.label}-${m.col}`} x={LEFT + m.col * STEP} y={12} className="fill-ink-400 text-[11px]">
              {m.label}
            </text>
          ))}
          {[
            ["Mon", 1],
            ["Wed", 3],
            ["Fri", 5],
          ].map(([label, row]) => (
            <text key={label} x={0} y={TOP + (row as number) * STEP + CELL - 2} className="fill-ink-400 text-[11px]">
              {label}
            </text>
          ))}
          {cells.map((c) =>
            c.future ? null : (
              <rect
                key={c.date}
                x={LEFT + c.col * STEP}
                y={TOP + c.row * STEP}
                width={CELL}
                height={CELL}
                rx={2}
                className={onSelect ? "cursor-pointer" : undefined}
                onClick={onSelect ? () => onSelect(c.date) : undefined}
                style={
                  c.date === selected
                    ? { fill: "rgb(var(--color-brand-500))", fillOpacity: Math.max(LEVEL_OPACITY[c.level], 0.15), stroke: "var(--chart-axis)", strokeWidth: 1.5 }
                    : !c.tracked
                    ? { fill: "transparent", stroke: "var(--chart-muted)", strokeWidth: 1 }
                    : c.level === 0
                      ? { fill: "var(--chart-muted)" }
                      : { fill: "rgb(var(--color-brand-500))", fillOpacity: LEVEL_OPACITY[c.level] }
                }
                onMouseEnter={() =>
                  setHover({ day: c.date, x: LEFT + c.col * STEP, y: TOP + c.row * STEP })
                }
              >
                <title>{c.date}</title>
              </rect>
            ),
          )}
        </svg>

        {hover ? (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-line bg-card px-2.5 py-1.5 text-2xs shadow-pop"
            style={{
              left: `${((hover.x + CELL / 2) / width) * 100}%`,
              top: `${(hover.y / height) * 100}%`,
              marginTop: -4,
            }}
          >
          <p className="font-semibold text-ink-900">
            {new Date(`${hover.day}T00:00:00Z`).toLocaleDateString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
              year: "numeric",
              timeZone: "UTC",
            })}
          </p>
          {!hoveredTracked ? (
            <p className="text-ink-500">Not tracked yet — no connector before this day</p>
          ) : hovered ? (
            <p className="text-ink-700">
              {formatDuration(hovered.activeMs)} AI active · {formatNumber(hovered.sessions)} sessions ·{" "}
              {formatNumber(hovered.modelRequests)} model calls · {formatNumber(hovered.toolCalls)} tool calls ·{" "}
              {formatNumber(hovered.fileChanges)} file changes
            </p>
          ) : (
            <p className="text-ink-500">No AI agent activity observed</p>
          )}
        </div>
      ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-2xs text-ink-500">
        <span className="flex items-center gap-1.5">
          <svg width={CELL} height={CELL} aria-hidden>
            <rect width={CELL} height={CELL} rx={2} style={{ fill: "transparent", stroke: "var(--chart-muted)" }} />
          </svg>
          Not tracked
        </span>
        <span className="flex items-center gap-1">
          Less
          {LEVEL_OPACITY.map((o, i) => (
            <svg key={i} width={CELL} height={CELL} aria-hidden>
              <rect
                width={CELL}
                height={CELL}
                rx={2}
                style={i === 0 ? { fill: "var(--chart-muted)" } : { fill: "rgb(var(--color-brand-500))", fillOpacity: o }}
              />
            </svg>
          ))}
          More
        </span>
      </div>
    </div>
  );
}
