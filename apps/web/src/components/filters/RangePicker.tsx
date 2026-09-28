"use client";

export const RANGE_PRESETS = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "90d", label: "90 days" },
] as const;

export type RangePreset = (typeof RANGE_PRESETS)[number]["id"] | "custom";

export interface RangeValue {
  preset: RangePreset;
  from?: string;
  to?: string;
}

export function RangePicker({
  value,
  onChange,
}: {
  value: RangeValue;
  onChange: (v: RangeValue) => void;
}) {
  return (
    <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="seg max-w-full overflow-x-auto overscroll-x-contain" role="group" aria-label="Date range">
        {RANGE_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={value.preset === p.id}
            className={value.preset === p.id ? "seg-item-on" : "seg-item"}
            onClick={() => onChange({ preset: p.id })}
          >
            {p.label}
          </button>
        ))}
      </div>
      <label className="flex w-full min-w-0 flex-wrap items-center gap-1.5 text-xs text-ink-500 sm:w-auto">
        <span className="sr-only">Custom start date</span>
        <input
          type="date"
          className="field h-9 min-w-0 flex-1 text-xs sm:w-[140px] sm:flex-none"
          value={value.from ?? ""}
          onChange={(e) =>
            onChange({ preset: "custom", from: e.target.value, to: value.to })
          }
        />
        <span aria-hidden>→</span>
        <span className="sr-only">Custom end date</span>
        <input
          type="date"
          className="field h-9 min-w-0 flex-1 text-xs sm:w-[140px] sm:flex-none"
          value={value.to ?? ""}
          onChange={(e) =>
            onChange({ preset: "custom", from: value.from, to: e.target.value })
          }
        />
      </label>
    </div>
  );
}

/** Serialises a range into the query params every analytics endpoint accepts. */
export function rangeParams(value: RangeValue): Record<string, string | undefined> {
  if (value.preset === "custom" && value.from) {
    return {
      from: new Date(value.from).toISOString(),
      to: value.to
        ? new Date(new Date(value.to).getTime() + 86_400_000).toISOString()
        : undefined,
    };
  }
  return { preset: value.preset };
}

export function rangeLabel(value: RangeValue): string {
  if (value.preset === "custom") {
    return value.from ? `${value.from} → ${value.to ?? "now"}` : "Custom range";
  }
  return RANGE_PRESETS.find((p) => p.id === value.preset)?.label ?? "7 days";
}
