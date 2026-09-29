"use client";

import { useEffect, useState } from "react";
import { usePreferences } from "./preferences";

/** True when the OS or Settings → Appearance asks for reduced motion. Charts use it to skip animation. */
export function useReducedMotion(): boolean {
  const { reduceMotion } = usePreferences();
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced || reduceMotion;
}

/** Recharts animation props: draw once on first paint, instantly under reduced motion. */
export function useChartAnimation(): { isAnimationActive: boolean; animationDuration: number } {
  const reduced = useReducedMotion();
  return { isAnimationActive: !reduced, animationDuration: reduced ? 0 : 400 };
}
