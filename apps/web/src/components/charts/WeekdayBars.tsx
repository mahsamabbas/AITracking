import { formatDuration } from "@/lib/format";
import type { WeekdayPattern } from "@/lib/types";

/**
 * Seven vertical bars, Monday first. Plain markup (no chart library) so it
 * stays crisp at any card height and every bar carries its value in a title.
 */
export function WeekdayBars({ data, color = "var(--chart-2)" }: { data: WeekdayPattern[]; color?: string }) {
  const ordered = [...data].sort((a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7));
  const max = Math.max(...ordered.map((d) => d.activeMs), 1);
  const peak = ordered.reduce<WeekdayPattern | null>((best, d) => (d.activeMs > (best?.activeMs ?? 0) ? d : best), null);
  if (!peak) return <p className="hint py-10 text-center">No agent activity in this period.</p>;
  return (
    <div className="flex h-full min-h-[200px] flex-col">
      <div className="flex flex-1 items-end gap-2">
        {ordered.map((d) => {
          const isPeak = d === peak;
          return (
            <div
              key={d.weekday}
              className="flex h-full flex-1 flex-col items-center justify-end gap-1.5"
              title={`${d.label}: ${formatDuration(d.activeMs)} · ${d.sessions} sessions`}
            >
              <span className={`num text-2xs ${isPeak ? "font-semibold text-ink-900" : "text-ink-500"}`}>
                {d.activeMs ? formatDuration(d.activeMs, { compact: true }) : ""}
              </span>
              <div
                className="w-full max-w-[36px] rounded-t-md transition-[height] duration-slow"
                style={{
                  height: `${Math.max(d.activeMs ? 4 : 1.5, (d.activeMs / max) * 100)}%`,
                  background: d.activeMs ? color : "var(--chart-muted)",
                  opacity: isPeak || !d.activeMs ? 1 : 0.55,
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-2 border-t border-line pt-2">
        {ordered.map((d) => (
          <span key={d.weekday} className={`flex-1 text-center text-2xs ${d === peak ? "font-semibold text-ink-900" : "text-ink-500"}`}>
            {d.label.slice(0, 3)}
          </span>
        ))}
      </div>
    </div>
  );
}
