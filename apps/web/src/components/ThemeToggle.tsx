"use client";

import { useTheme, type ThemePreference } from "@/lib/theme";

const NEXT: Record<ThemePreference, ThemePreference> = { light: "dark", dark: "system", system: "light" };
const LABEL: Record<ThemePreference, string> = { light: "Light", dark: "Dark", system: "System" };

/** Cycles Light → Dark → System. "System" follows the OS setting live. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { preference, theme } = useTheme();
  const { cyclePreference } = useTheme();
  const next = NEXT[preference];
  const hint =
    preference === "system"
      ? `Theme: System (currently ${theme}). Switch to ${LABEL[next]}`
      : `Theme: ${LABEL[preference]}. Switch to ${LABEL[next]}`;
  return (
    <button
      type="button"
      className={`btn-ghost h-9 w-9 shrink-0 px-0 ${className}`}
      onClick={cyclePreference}
      aria-label={hint}
      title={hint}
    >
      {preference === "system" ? (
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
          <rect x="3" y="4" width="14" height="10" rx="1.6" />
          <path strokeLinecap="round" d="M7.5 17h5M10 14v3" />
        </svg>
      ) : preference === "dark" ? (
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
          <path strokeLinejoin="round" d="M11.4 3.2a6.4 6.4 0 1 0 5.4 9.4A5.2 5.2 0 0 1 11.4 3.2Z" />
        </svg>
      ) : (
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
          <circle cx="10" cy="10" r="3.2" />
          <path
            strokeLinecap="round"
            d="M10 2.8v1.6M10 15.6v1.6M2.8 10h1.6M15.6 10h1.6M4.9 4.9l1.1 1.1M14 14l1.1 1.1M4.9 15.1 6 14M14 6l1.1-1.1"
          />
        </svg>
      )}
    </button>
  );
}
