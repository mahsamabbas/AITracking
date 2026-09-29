/**
 * Data retention policy — one place for every window, overridable per
 * deployment through environment variables.
 *
 *   raw events        RAW_RETENTION_DAYS (14)   then summarised + archived + removed
 *   hourly summaries  forever (tiny: one row per person-hour with activity)
 *   agent sessions    SESSION_RETENTION_DAYS (190: a 90-day view + its previous period)
 *   audit log         AUDIT_RETENTION_DAYS (400)
 *   report exports    EXPORT_RETENTION_DAYS (7)
 *
 * Long-lived event types are rare and small (commits, coverage gaps, provider
 * daily totals); they keep powering Verify & ship, coverage, and plan usage
 * for as long as sessions are kept.
 */

function days(name: string, fallback: number, min: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw >= min ? Math.floor(raw) : fallback;
}

export const DAY_MS = 86_400_000;

export function retentionPolicy() {
  return {
    rawEventDays: days("RAW_RETENTION_DAYS", 14, 3),
    sessionDays: days("SESSION_RETENTION_DAYS", 190, 30),
    auditDays: days("AUDIT_RETENTION_DAYS", 400, 30),
    exportDays: days("EXPORT_RETENTION_DAYS", 7, 1),
  };
}

/** Kept as long as sessions: small, and needed for long-range views. */
export const LONG_LIVED_EVENT_TYPES = [
  "commit_created",
  "commit_pushed",
  "telemetry_gap_started",
  "telemetry_gap_ended",
  "connector_paused",
  "connector_resumed",
  "provider_daily_aggregate",
] as const;

/** SQL predicate (alias `e`): rows that stay when raw events are purged. */
export const LONG_LIVED_SQL = (alias = "e") =>
  `(${alias}.event_type IN (${LONG_LIVED_EVENT_TYPES.map((t) => `'${t}'`).join(", ")})` +
  // Legacy commits were recorded as build_completed with tool_name git_commit.
  ` OR (${alias}.event_type = 'build_completed' AND ${alias}.payload->'metadata'->>'tool_name' = 'git_commit'))`;

/** UTC midnight of the given instant. */
export function utcDay(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
}

export function dayKey(day: Date): string {
  return day.toISOString().slice(0, 10);
}

/**
 * Raw events before this instant are eligible to be summarised, archived, and
 * removed. Whole UTC days only, so a day is never half summarised.
 */
export function rawCutoff(now = new Date()): Date {
  return new Date(utcDay(now).getTime() - retentionPolicy().rawEventDays * DAY_MS);
}
