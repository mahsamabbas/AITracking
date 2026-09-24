import type { FastifyRequest } from "fastify";
import {
  resolveReportingTimezone,
  TECHLIO_DISPLAY_TIMEZONE_HEADER,
} from "@techlio/server-core";
import { orgAccessFromRequest } from "./org-scope.js";

export function displayTimezoneFromRequest(req: FastifyRequest): string | undefined {
  const raw = req.headers[TECHLIO_DISPLAY_TIMEZONE_HEADER];
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

export async function reportingTimezoneFromRequest(
  req: FastifyRequest,
  organizationId: string,
): Promise<string> {
  return resolveReportingTimezone(organizationId, displayTimezoneFromRequest(req));
}

/** Organisation id plus effective reporting timezone for analytics queries. */
export async function orgAnalyticsContext(req: FastifyRequest): Promise<{
  organizationId: string;
  timeZone: string;
}> {
  const { organizationId } = await orgAccessFromRequest(req);
  const timeZone = await reportingTimezoneFromRequest(req, organizationId);
  return { organizationId, timeZone };
}
