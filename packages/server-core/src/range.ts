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
function startOfCalendarDate(y: number, m: number, d: number, timeZone?: string): Date {
  if (!timeZone || timeZone === "UTC") {
    return new Date(Date.UTC(y, m - 1, d));
  }
  try {
    const guess = Date.UTC(y, m - 1, d);
    const first = guess - zoneOffsetMs(guess, timeZone);
    return new Date(guess - zoneOffsetMs(first, timeZone));
  } catch {
    return new Date(Date.UTC(y, m - 1, d));
  }
}

function startOfDay(d: Date, timeZone?: string): Date {
  if (!timeZone || timeZone === "UTC") {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }
  try {
    const local = new Intl.DateTimeFormat("en-CA", { timeZone }).format(d); // YYYY-MM-DD
    const [y, m, day] = local.split("-").map(Number);
    return startOfCalendarDate(y, m, day, timeZone);
  } catch {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }
}

const CALENDAR_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Calendar `YYYY-MM-DD` is the start of that local day in `timeZone`.
 * Full timestamps stay as given (UTC or offset already encoded).
 */
function parseBound(value: string, timeZone?: string): Date | null {
  const day = CALENDAR_DAY.exec(value.trim());
  if (day) {
    return startOfCalendarDate(Number(day[1]), Number(day[2]), Number(day[3]), timeZone);
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
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
    const from = parseBound(input.from, input.timeZone);
    if (from) {
      const toDay = input.to ? CALENDAR_DAY.test(input.to.trim()) : false;
      const toParsed = input.to ? parseBound(input.to, input.timeZone) : now;
      if (toParsed && !Number.isNaN(toParsed.getTime())) {
        // Date-picker `to` is inclusive; convert to an exclusive upper bound.
        const to = toDay ? new Date(toParsed.getTime() + DAY) : toParsed;
        return { range: { from, to }, preset: "custom" };
      }
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
