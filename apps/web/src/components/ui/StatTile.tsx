import { percentChange } from "@/lib/format";
import { Sparkline } from "@/components/charts/Sparkline";
import { InfoDot } from "./InfoDot";
import { IconChip, type IconName, type Tone } from "./Icon";

type Accent = "brand" | "teal" | "amber" | "rose" | "slate";

const SPARK_COLOR: Record<Accent, string> = {
  brand: "var(--chart-1)",
  teal: "var(--chart-2)",
  amber: "var(--chart-3)",
  rose: "var(--chart-4)",
  slate: "var(--chart-axis)",
};

/**
 * Headline number. Optional icon, previous-period delta (neutral colour — a
 * drop in AI usage is not bad news about a person), and a sparkline of the
 * period so the number reads with its shape.
 */
export function StatTile({
  label,
  value,
  unit,
  hint,
  help,
  current,
  previous,
  invertDelta = false,
  accent = "brand",
  icon,
  spark,
}: {
  label: string;
  value: string | number;
  unit?: string;
  hint?: string;
  help?: string;
  current?: number;
  previous?: number;
  /** For metrics where "up" is not good news (failures, coverage gaps). */
  invertDelta?: boolean;
  accent?: Accent;
  icon?: IconName;
  /** Per-day values for the period; drawn only when there are 2+ points. */
  spark?: number[];
}) {
  const delta =
    current !== undefined && previous !== undefined
      ? percentChange(current, previous)
      : undefined;
  void invertDelta; // kept for API compatibility; deltas are always neutral now

  return (
    <div className="stat-tile" style={{ "--tile-accent": SPARK_COLOR[accent] } as React.CSSProperties}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="label truncate">{label}</p>
          {help ? <InfoDot text={help} label={`About ${label}`} /> : null}
        </div>
        {icon ? <span className="hidden sm:inline-flex"><IconChip name={icon} tone={accent as Tone} size="sm" /></span> : null}
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="flex min-w-0 items-baseline gap-1.5">
          <span className="num truncate text-xl font-semibold leading-none tracking-tight text-ink-900 sm:text-[26px]">
            {value}
          </span>
          {unit ? <span className="text-sm text-ink-500">{unit}</span> : null}
        </p>
        {spark && spark.length > 1 ? (
          <span className="hidden shrink-0 opacity-90 sm:block">
            <Sparkline points={spark} width={84} height={28} color={SPARK_COLOR[accent]} />
          </span>
        ) : null}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        {delta !== undefined ? (
          <span className="num inline-flex items-center gap-0.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-2xs font-semibold text-ink-700 dark:bg-white/10">
            <span aria-hidden>{delta == null || delta === 0 ? "→" : delta > 0 ? "↑" : "↓"}</span>
            <span className="sr-only">
              {delta == null ? "new this period" : delta > 0 ? "up" : delta < 0 ? "down" : "unchanged"}
            </span>
            {delta == null ? "new" : `${Math.abs(Math.round(delta))}%`}
          </span>
        ) : null}
        {hint ? <span className="hint">{hint}</span> : null}
      </div>
    </div>
  );
}
