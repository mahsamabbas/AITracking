"use client";

import { useEffect, useState } from "react";

/** True when the user asked the OS to reduce motion. Charts use it to skip animation. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

/** Recharts animation props: draw once on first paint, instantly under reduced motion. */
export function useChartAnimation(): { isAnimationActive: boolean; animationDuration: number } {
  const reduced = useReducedMotion();
  return { isAnimationActive: !reduced, animationDuration: reduced ? 0 : 400 };
}
