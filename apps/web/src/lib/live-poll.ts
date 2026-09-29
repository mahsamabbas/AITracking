import type { RangeValue } from "@/components/filters/RangePicker";
import { todayKey } from "./format";

/** How often live strips and current-range analytics refresh (no WebSocket). */
export const LIVE_POLL_MS = 30_000;

/** Ranges whose end is today or later should keep updating as connectors report. */
export function rangeIncludesNow(range: RangeValue): boolean {
  if (range.preset === "yesterday") return false;
  if (range.preset === "custom") {
    return !range.to || range.to >= todayKey();
  }
  return true;
}

export function analyticsPollMs(range: RangeValue): number | undefined {
  return rangeIncludesNow(range) ? LIVE_POLL_MS : undefined;
}
