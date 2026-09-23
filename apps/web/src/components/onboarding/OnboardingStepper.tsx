"use client";

import { useConnectorSetupPhase } from "@/lib/connector-local";

const LABELS = ["Install agent", "Admin key", "Activate key"];

export function OnboardingStepper() {
  const { phase } = useConnectorSetupPhase(4_000);
  const current =
    phase === "ready" ? 4 : phase === "unpaired" ? 3 : phase === "offline" ? 1 : 1;

  return (
    <nav className="mb-5" aria-label="Onboarding progress">
      <ol className="grid gap-2 sm:grid-cols-3">
        {LABELS.map((label, i) => {
          const n = i + 1;
          const done = current > n;
          const active = current === n;
          return (
            <li
              key={label}
              className={`flex min-w-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${
                active
                  ? "border-brand-solid bg-brand-solid text-white"
                  : done
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100"
                    : "border-line bg-card text-ink-700"
              }`}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  active
                    ? "bg-white/20 text-white"
                    : done
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-200 text-ink-700 dark:bg-slate-700 dark:text-ink-100"
                }`}
              >
                {done ? "✓" : n}
              </span>
              <span className="truncate">{label}</span>
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        className="btn-ghost mt-2 h-8 text-xs text-brand-700 dark:text-brand-300"
        onClick={() => window.dispatchEvent(new CustomEvent("techlio:start-tour"))}
      >
        Show guided tour
      </button>
    </nav>
  );
}
