/** Shared time helpers and units for server-side analytics. */

export const HOUR_MS = 3_600_000;

/** Start of the UTC clock hour containing `d`. */
export function hourStartUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours()));
}
