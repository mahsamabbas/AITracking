"use client";

import { useDisplayTimezone } from "@/lib/display-timezone";
import { DEFAULT_TIMEZONE, timezoneLabel } from "@/lib/timezone-options";
import { useEffect, useId, useRef, useState } from "react";

function compactLabel(timezone: string, full: string): string {
  if (timezone === DEFAULT_TIMEZONE) return "PKT";
  const paren = full.match(/\(([^)]+)\)/);
  if (paren?.[1]) return paren[1];
  return full.length > 12 ? `${full.slice(0, 11)}…` : full;
}

export function TimezoneSelect({ compact }: { compact?: boolean }) {
  const { timezone, options, setTimezone, label } = useDisplayTimezone();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const shown = compact ? compactLabel(timezone, label) : label;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className="field inline-flex h-9 min-w-[5.5rem] max-w-[11rem] items-center justify-between gap-2 truncate px-2.5 text-left text-xs font-medium text-ink-900 sm:max-w-[12.5rem] sm:text-sm"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listId}
        title={`Display timezone: ${label}. Hour and day charts use this zone.`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="flex min-w-0 flex-col truncate leading-tight">
          {!compact ? (
            <span className="text-2xs font-normal text-ink-500">Time zone</span>
          ) : null}
          <span className="truncate">{shown}</span>
        </span>
        <svg
          viewBox="0 0 20 20"
          className={`h-4 w-4 shrink-0 text-ink-400 transition ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
        >
          <path d="M5 8l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Display timezone"
          className="absolute left-0 top-full z-[100] mt-1 max-h-64 min-w-[13.5rem] overflow-y-auto rounded-lg border border-line bg-card py-1 shadow-pop"
        >
          {options.map((o) => {
            const selected = o.id === timezone;
            return (
              <li key={o.id} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition hover:bg-brand-50/80 dark:hover:bg-white/5 ${
                    selected ? "bg-brand-50/60 font-medium text-brand-800 dark:bg-white/5 dark:text-brand-200" : "text-ink-800"
                  }`}
                  onClick={() => {
                    setTimezone(o.id);
                    setOpen(false);
                  }}
                >
                  <span>{o.label}</span>
                  {selected ? (
                    <span className="text-xs text-brand-600 dark:text-brand-300" aria-hidden>
                      ✓
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
