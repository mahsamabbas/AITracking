import { percentChange } from "@/lib/format";
import { InfoDot } from "./InfoDot";

export function StatTile({
  label,
  value,
  unit,
  hint,
  help,
  current,
  previous,
  invertDelta = false,
  accent,
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
  accent?: "brand" | "teal" | "amber" | "rose" | "slate";
}) {
  const delta =
    current !== undefined && previous !== undefined
      ? percentChange(current, previous)
      : undefined;
  void invertDelta; // kept for API compatibility; deltas are always neutral now

  const bar =
    accent === "teal"
      ? "bg-teal-500"
      : accent === "amber"
        ? "bg-amber-500"
        : accent === "rose"
          ? "bg-rose-500"
          : accent === "slate"
            ? "bg-slate-400"
            : "bg-brand-500";

  return (
    <div className="card relative overflow-hidden p-5 transition-shadow duration-fast hover:shadow-pop">
      <span className={`absolute inset-y-0 left-0 w-[3px] ${bar}`} aria-hidden />
      <div className="flex items-center gap-1.5">
        <p className="label">{label}</p>
        {help ? <InfoDot text={help} /> : null}
      </div>
      <p className="mt-2 flex items-baseline gap-1.5">
        <span className="num text-[26px] font-semibold leading-none tracking-tight text-ink-900">
          {value}
        </span>
        {unit ? <span className="text-sm text-ink-500">{unit}</span> : null}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        {delta !== undefined ? (
          // Direction is shown with an arrow and a neutral colour. A drop in AI
          // usage is not bad news about a person, so nothing is painted red.
          <span className="num inline-flex items-center gap-0.5 text-xs font-medium text-ink-700">
            {delta == null || delta === 0 ? (
              <span aria-hidden>→</span>
            ) : delta > 0 ? (
              <span aria-hidden>↑</span>
            ) : (
              <span aria-hidden>↓</span>
            )}
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
