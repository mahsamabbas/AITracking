"use client";

import { useState } from "react";
import { usePwa } from "@/lib/pwa";
import { BRAND } from "@/lib/brand";
import { Button } from "@/components/ui/Button";

/**
 * "Install app" — visible only while the app can be installed and is not
 * installed yet; hidden inside the installed app and after installing.
 */
export function InstallAppButton({ compact = false }: { compact?: boolean }) {
  const { installed, canPrompt, iosManual, install } = usePwa();
  const [iosHelp, setIosHelp] = useState(false);
  const [installing, setInstalling] = useState(false);

  if (installed || (!canPrompt && !iosManual)) return null;

  return (
    <div className="relative">
      <Button
        variant="primary"
        className={`inline-flex h-11 sm:h-9 ${compact ? "" : "sm:px-3.5"}`}
        loading={installing}
        loadingLabel="Installing…"
        onClick={() => {
          if (installing) return;
          if (canPrompt) {
            setInstalling(true);
            void install().finally(() => setInstalling(false));
          } else {
            setIosHelp((v) => !v);
          }
        }}
        aria-expanded={iosManual ? iosHelp : undefined}
        title={`Install ${BRAND.name} on this device`}
        aria-label={`Install ${BRAND.name} app`}
      >
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M10 3v9m0 0-3.5-3.5M10 12l3.5-3.5M4 14.5V16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-1.5" />
        </svg>
        <span className={compact ? "hidden sm:inline" : ""}>Install app</span>
      </Button>
      {iosHelp ? (
        <div
          role="dialog"
          aria-label="Install on iPhone or iPad"
          className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-line bg-card p-3 text-xs text-ink-700 shadow-pop"
        >
          <p className="mb-1.5 font-semibold text-ink-900">Install {BRAND.name}</p>
          <ol className="list-decimal space-y-1 pl-4">
            <li>
              Tap <strong>Share</strong>{" "}
              <svg viewBox="0 0 20 20" className="inline h-3.5 w-3.5 align-[-2px]" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                <path d="M10 13V3m0 0L6.5 6.5M10 3l3.5 3.5M5 9v7h10V9" />
              </svg>{" "}
              in Safari&apos;s toolbar.
            </li>
            <li>
              Choose <strong>Add to Home Screen</strong>.
            </li>
          </ol>
          <Button variant="ghost" className="mt-2 h-8 w-full text-xs" onClick={() => setIosHelp(false)}>
            Got it
          </Button>
        </div>
      ) : null}
    </div>
  );
}
