import type { DateRange } from "./analytics.js";

export type RangePreset = "today" | "yesterday" | "7d" | "30d" | "90d" | "custom";

export const RANGE_PRESETS: { id: RangePreset; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "90d", label: "Last 90 days" },
];

const DAY = 86_400_000;

/** Milliseconds `timeZone` is ahead of UTC at instant `t`. */
function zoneOffsetMs(t: number, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(new Date(t))
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - Math.floor(t / 1000) * 1000;
}

/**
 * Midnight of `d`'s calendar day in `timeZone` (UTC when omitted), so "Today"
 * matches the day keys every chart groups by.
 */
function startOfDay(d: Date, timeZone?: string): Date {
  if (!timeZone || timeZone === "UTC") {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }
  try {
    const local = new Intl.DateTimeFormat("en-CA", { timeZone }).format(d); // YYYY-MM-DD
    const [y, m, day] = local.split("-").map(Number);
    const guess = Date.UTC(y, m - 1, day);
    // Two passes handle DST transitions around midnight.
    const first = guess - zoneOffsetMs(guess, timeZone);
    return new Date(guess - zoneOffsetMs(first, timeZone));
  } catch {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }
}

/**
 * Resolves the dashboard date filter. Explicit from/to always wins; otherwise
 * the preset is anchored on "now" so "today" means the current clock day.
 */
export function resolveRange(input: {
  preset?: string;
  from?: string;
  to?: string;
  now?: Date;
  /** Organisation / viewer timezone: day presets start at its midnight. */
  timeZone?: string;
}): { range: DateRange; preset: RangePreset } {
  const now = input.now ?? new Date();

  if (input.from) {
    const from = new Date(input.from);
    const to = input.to ? new Date(input.to) : now;
    if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime())) {
      return { range: { from, to }, preset: "custom" };
    }
  }

  const today = startOfDay(now, input.timeZone);
  switch (input.preset) {
    case "today":
      return { range: { from: today, to: new Date(today.getTime() + DAY) }, preset: "today" };
    case "yesterday":
      return {
        range: { from: new Date(today.getTime() - DAY), to: today },
        preset: "yesterday",
      };
    case "90d":
      return {
        range: { from: new Date(today.getTime() - 89 * DAY), to: new Date(today.getTime() + DAY) },
        preset: "90d",
      };
    case "30d":
      return {
        range: { from: new Date(today.getTime() - 29 * DAY), to: new Date(today.getTime() + DAY) },
        preset: "30d",
      };
    case "7d":
    default:
      return {
        range: { from: new Date(today.getTime() - 6 * DAY), to: new Date(today.getTime() + DAY) },
        preset: "7d",
      };
  }
}
