"use client";

/**
 * Filters stick just below the page header while the content scrolls, so the
 * active range and filters stay visible next to the numbers they shape.
 */
import { FIELD_LIMITS } from "@/lib/validation";
export function FilterBar({
  children,
  right,
  sticky = true,
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
  sticky?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label="Filters"
      className={`mb-5 flex flex-wrap items-center gap-2.5 ${
        sticky
          ? // Sticky only on wide screens; on phones the wrapped filters would cover the page.
            // Opaque enough, with a hairline, that content scrolling underneath never reads as part of it.
            "lg:sticky lg:top-[var(--header-h,72px)] lg:z-20 lg:-mx-8 lg:border-b lg:border-line/70 lg:bg-canvas/90 lg:px-8 lg:py-2.5 lg:shadow-[0_10px_18px_-16px_rgb(16_24_40/0.35)] lg:backdrop-blur-xl"
          : ""
      }`}
    >
      {children}
      {right ? (
        <div className="flex w-full basis-full items-center gap-2 sm:ml-auto sm:w-auto sm:basis-auto">
          {right}
        </div>
      ) : null}
    </div>
  );
}

export function SelectFilter({
  label,
  value,
  onChange,
  options,
  allLabel = "All",
  width = "w-full min-w-0 sm:w-[150px]",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  allLabel?: string;
  width?: string;
}) {
  return (
    <label className={`relative ${width}`}>
      <span className="sr-only">{label}</span>
      <select
        className="field appearance-none pr-8 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-400" aria-hidden>
        ▾
      </span>
    </label>
  );
}

export function SearchFilter({
  value,
  onChange,
  placeholder = "Search",
  width = "w-full min-w-0 sm:w-[240px]",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  width?: string;
}) {
  return (
    <div className={`relative ${width}`}>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" aria-hidden>
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="7" cy="7" r="4.5" />
          <path d="m10.5 10.5 3 3" strokeLinecap="round" />
        </svg>
      </span>
      <input
        type="search"
        className="field pl-9"
        value={value}
        maxLength={FIELD_LIMITS.searchQuery}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export function ActiveFilters({
  chips,
  onClear,
}: {
  chips: { label: string; onRemove: () => void }[];
  onClear: () => void;
}) {
  if (chips.length === 0) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {chips.map((c) => (
        <button
          key={c.label}
          type="button"
          onClick={c.onRemove}
          className="badge-info hover:bg-brand-100"
        >
          {c.label}
          <span aria-hidden className="ml-0.5 text-brand-400">×</span>
        </button>
      ))}
      <button type="button" onClick={onClear} className="text-xs font-medium text-ink-500 hover:text-ink-900">
        Clear all
      </button>
    </div>
  );
}
