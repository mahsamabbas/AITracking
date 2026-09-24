import { eq } from "drizzle-orm";
import { db } from "./db.js";
import { organizations } from "./schema.js";

/** Default reporting timezone for new orgs and when nothing else is configured. */
export const DEFAULT_TIMEZONE = "Asia/Karachi";

export const TECHLIO_DISPLAY_TIMEZONE_HEADER = "x-techlio-display-timezone";

export function timezoneFromEnv(): string {
  const raw = process.env.ORG_TIMEZONE?.trim();
  return raw || DEFAULT_TIMEZONE;
}

export function isValidIanaTimezone(tz: string): boolean {
  const value = tz.trim();
  if (!value) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export async function resolveOrgTimezone(organizationId: string): Promise<string> {
  const rows = await db
    .select({ timezone: organizations.timezone })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  const fromDb = rows[0]?.timezone?.trim();
  if (fromDb && isValidIanaTimezone(fromDb)) return fromDb;
  return timezoneFromEnv();
}

/** Org timezone unless the viewer sent a valid display-timezone header. */
export async function resolveReportingTimezone(
  organizationId: string,
  displayOverride?: string,
): Promise<string> {
  const override = displayOverride?.trim();
  if (override && isValidIanaTimezone(override)) return override;
  return resolveOrgTimezone(organizationId);
}
