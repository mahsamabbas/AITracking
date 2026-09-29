"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";

export type TourPlacement = "top" | "bottom" | "left" | "right";

export type TourStep = {
  id: string;
  selector: string;
  title: string;
  body: string;
  placement?: TourPlacement;
  /** Only show on these paths (prefix match). Omit = any page. */
  paths?: string[];
  cta?: { label: string; href: string };
};

type Rect = { top: number; left: number; width: number; height: number };

function measure(selector: string): Rect | null {
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function popoverStyle(
  target: Rect,
  placement: TourPlacement,
): { top: number; left: number; arrow: TourPlacement } {
  const gap = 14;
  const popW = 320;
  const popH = 160;
  let top = 0;
  let left = 0;
  let arrow = placement;

  switch (placement) {
    case "bottom":
      top = target.top + target.height + gap;
      left = target.left + target.width / 2 - popW / 2;
      break;
    case "top":
      top = target.top - gap - popH;
      left = target.left + target.width / 2 - popW / 2;
      break;
    case "right":
      top = target.top + target.height / 2 - popH / 2;
      left = target.left + target.width + gap;
      arrow = "left";
      break;
    case "left":
      top = target.top + target.height / 2 - popH / 2;
      left = target.left - gap - popW;
      arrow = "right";
      break;
  }

  left = Math.max(12, Math.min(left, window.innerWidth - popW - 12));
  top = Math.max(12, Math.min(top, window.innerHeight - popH - 12));

  return { top, left, arrow };
}

const ARROW: Record<TourPlacement, string> = {
  bottom: "bottom-full left-1/2 -translate-x-1/2 border-b-slate-800",
  top: "top-full left-1/2 -translate-x-1/2 border-t-slate-800",
  left: "left-full top-1/2 -translate-y-1/2 border-l-slate-800",
  right: "right-full top-1/2 -translate-y-1/2 border-r-slate-800",
};

export function TourSpotlight({
  steps,
  active,
  stepIndex,
  onStepIndexChange,
  onDone,
}: {
  steps: TourStep[];
  active: boolean;
  stepIndex: number;
  onStepIndexChange: (n: number) => void;
  onDone?: () => void;
}) {
  const [rect, setRect] = useState<Rect | null>(null);
  const pathname = usePathname();

  const step = steps[stepIndex];
  const pathOk =
    !step?.paths?.length || step.paths.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  const updateRect = useCallback(() => {
    if (!step || !pathOk) {
      setRect(null);
      return;
    }
    setRect(measure(step.selector));
  }, [step, pathOk]);

  useLayoutEffect(() => {
    if (!active) return;
    updateRect();
  }, [active, updateRect, stepIndex, pathname]);

  useEffect(() => {
    if (!active) return;
    const onScroll = () => updateRect();
    window.addEventListener("resize", onScroll);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [active, updateRect]);

  if (!active || !step) return null;

  const pad = 10;
  const highlight = rect
    ? {
        top: rect.top - pad,
        left: rect.left - pad,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
      }
    : null;

  const pop = highlight
    ? popoverStyle(highlight, step.placement ?? "bottom")
    : { top: 80, left: 24, arrow: "top" as TourPlacement };

  const isLast = stepIndex >= steps.length - 1;

  return (
    <div className="fixed inset-0 z-[200] pointer-events-none" aria-live="polite">
      {highlight ? (
        <div
          className="pointer-events-none absolute rounded-xl ring-4 ring-brand-400 ring-offset-2 ring-offset-transparent"
          style={{
            top: highlight.top,
            left: highlight.left,
            width: highlight.width,
            height: highlight.height,
            boxShadow: "0 0 0 9999px rgba(15, 18, 24, 0.72)",
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-ink-900/70" />
      )}

      <div
        className="pointer-events-auto absolute w-[min(100vw-24px,20rem)] rounded-xl border border-slate-600 bg-slate-800 p-4 text-slate-50 shadow-pop"
        style={{ top: pop.top, left: pop.left }}
        role="dialog"
        aria-labelledby="tour-title"
      >
        <div
          className={`absolute h-0 w-0 border-8 border-transparent ${ARROW[pop.arrow]}`}
          aria-hidden
        />
        <p className="text-2xs font-semibold uppercase tracking-wide text-brand-300">
          Step {stepIndex + 1} of {steps.length}
        </p>
        <p id="tour-title" className="mt-1 text-sm font-semibold text-white">{step.title}</p>
        <p className="mt-2 text-xs leading-relaxed text-slate-200">{step.body}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {step.cta ? (
            <a href={step.cta.href} className="btn-primary h-8 text-xs">
              {step.cta.label} →
            </a>
          ) : null}
          {stepIndex > 0 ? (
            <button
              type="button"
              className="inline-flex h-8 items-center rounded-lg border border-slate-500 bg-slate-700 px-3 text-xs font-medium text-white hover:bg-slate-600"
              onClick={() => onStepIndexChange(stepIndex - 1)}
            >
              Back
            </button>
          ) : null}
          {!isLast ? (
            <button
              type="button"
              className="btn-primary h-8 text-xs"
              onClick={() => onStepIndexChange(stepIndex + 1)}
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              className="btn-primary h-8 text-xs"
              onClick={() => onDone?.()}
            >
              Got it
            </button>
          )}
        </div>
        {!rect ? (
          <p className="mt-2 text-2xs text-amber-200">
            Scroll to the highlighted section or use the button above to continue.
          </p>
        ) : null}
      </div>
    </div>
  );
}
