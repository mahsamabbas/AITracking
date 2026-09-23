"use client";

import { useId, useState } from "react";

/**
 * A titled group of cards. Optional collapse for long pages (employee hub);
 * collapsed state is per-visit only.
 */
export function Section({
  title,
  description,
  actions,
  collapsible = false,
  defaultOpen = true,
  children,
  className = "",
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <section className={`mt-8 first:mt-0 ${className}`} aria-labelledby={`${id}-title`}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          {collapsible ? (
            <button
              type="button"
              className="flex items-center gap-1.5 text-left"
              aria-expanded={open}
              aria-controls={`${id}-body`}
              onClick={() => setOpen((v) => !v)}
            >
              <svg
                viewBox="0 0 20 20"
                className={`h-3.5 w-3.5 text-ink-400 transition-transform duration-fast ${open ? "rotate-90" : ""}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden
              >
                <path d="m7 5 5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <h2 id={`${id}-title`} className="text-[15px] font-semibold tracking-tight text-ink-900">
                {title}
              </h2>
            </button>
          ) : (
            <h2 id={`${id}-title`} className="text-[15px] font-semibold tracking-tight text-ink-900">
              {title}
            </h2>
          )}
          {description ? <p className="hint mt-0.5">{description}</p> : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
      {!collapsible || open ? (
        <div id={`${id}-body`} className="crossfade">
          {children}
        </div>
      ) : null}
    </section>
  );
}
