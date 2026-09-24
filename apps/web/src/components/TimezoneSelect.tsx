"use client";

import { useDisplayTimezone } from "@/lib/display-timezone";

export function TimezoneSelect({ compact }: { compact?: boolean }) {
  const { timezone, options, setTimezone } = useDisplayTimezone();

  return (
    <label className={`inline-flex items-center gap-1.5 ${compact ? "text-xs" : "text-sm"}`}>
      <span className="sr-only">Timezone</span>
      {!compact ? (
        <span className="hidden text-ink-500 sm:inline" aria-hidden>
          Timezone
        </span>
      ) : null}
      <select
        className="h-9 max-w-[11rem] truncate rounded-lg border border-line bg-card px-2 text-xs font-medium text-ink-900 dark:bg-white/5 sm:max-w-[12.5rem] sm:text-sm"
        value={timezone}
        onChange={(e) => setTimezone(e.target.value)}
        aria-label="Display timezone"
        title="Hour and day labels use this timezone"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
