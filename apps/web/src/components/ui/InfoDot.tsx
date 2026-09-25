"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const GAP = 8;
const EDGE = 12;
const MAX_W = 280;

type Placement = { top: number; left: number; arrowLeft: number; side: "top" | "bottom" };

/**
 * Accessible inline explanation — keyboard focusable, tap-to-toggle on touch,
 * hover on pointer devices. The bubble renders in a portal with fixed
 * positioning, so it is never clipped by a card's `overflow-hidden` and always
 * stays inside the viewport (flips above when there is no room below).
 */
export function InfoDot({ text, label = "More information" }: { text: string; label?: string }) {
  const id = useId();
  const btnRef = useRef<HTMLButtonElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [pos, setPos] = useState<Placement | null>(null);

  const place = useCallback(() => {
    const btn = btnRef.current;
    const tip = tipRef.current;
    if (!btn || !tip) return;
    const r = btn.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = Math.min(MAX_W, vw - EDGE * 2);
    tip.style.width = `${w}px`;
    const h = tip.offsetHeight;
    const center = r.left + r.width / 2;
    const left = Math.min(Math.max(center - w / 2, EDGE), vw - w - EDGE);
    const below = r.bottom + GAP + h <= vh - EDGE || r.top - GAP - h < EDGE;
    setPos({
      top: below ? r.bottom + GAP : r.top - GAP - h,
      left,
      arrowLeft: Math.min(Math.max(center - left, 12), w - 12),
      side: below ? "bottom" : "top",
    });
  }, []);

  useLayoutEffect(() => {
    if (open) place();
    else setPos(null);
  }, [open, place, text]);

  useEffect(() => {
    if (!open) return;
    const close = () => {
      setOpen(false);
      setPinned(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!btnRef.current?.contains(t) && !tipRef.current?.contains(t)) close();
    };
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open, place]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        className="info-dot"
        onClick={() => {
          setPinned((p) => !p);
          setOpen((o) => (pinned ? !o : true));
        }}
        onPointerEnter={(e) => e.pointerType === "mouse" && setOpen(true)}
        onPointerLeave={(e) => e.pointerType === "mouse" && !pinned && setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => !pinned && setOpen(false)}
      >
        i
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={tipRef}
              id={id}
              role="tooltip"
              data-side={pos?.side ?? "bottom"}
              className="info-tip"
              style={{
                top: pos?.top ?? -9999,
                left: pos?.left ?? -9999,
                visibility: pos ? "visible" : "hidden",
                ["--arrow-left" as string]: `${pos?.arrowLeft ?? 0}px`,
              }}
            >
              {text}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
