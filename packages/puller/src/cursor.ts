import type { ActivityEvent } from "@techlio/event-schema";
import { EventTypes, SCHEMA_VERSION } from "@techlio/event-schema";
import { deterministicEventId } from "./idempotency.js";
import { cleanMetadata } from "./metadata.js";

/**
 * One row of POST /teams/daily-usage-data, using the field names the Cursor
 * Admin API actually returns (https://cursor.com/docs/account/teams/admin-api).
 */
export interface CursorDailyRow {
  userId?: number | string;
  email?: string;
  /** Epoch ms. */
  date?: number;
  /** Some responses also include a formatted day. */
  day?: string;
  isActive?: boolean;
  totalLinesAdded?: number;
  totalLinesDeleted?: number;
  totalTabsAccepted?: number;
  chatRequests?: number;
  composerRequests?: number;
  agentRequests?: number;
  subscriptionIncludedReqs?: number;
  usageBasedReqs?: number;
  apiKeyReqs?: number;
}

function sum(...values: (number | undefined)[]): number | undefined {
  const present = values.filter((v): v is number => typeof v === "number");
  return present.length ? present.reduce((a, b) => a + b, 0) : undefined;
}

export function cursorRowDay(row: CursorDailyRow): string {
  if (typeof row.date === "number") return new Date(row.date).toISOString().slice(0, 10);
  if (row.day) return row.day.slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

export async function fetchCursorDailyUsage(
  apiKey: string,
  startDateMs: number,
  endDateMs: number,
): Promise<CursorDailyRow[]> {
  const res = await fetch("https://api.cursor.com/teams/daily-usage-data", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
    },
    body: JSON.stringify({ startDate: startDateMs, endDate: endDateMs }),
  });
  if (!res.ok) {
    throw new Error(`Cursor API ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as { data?: CursorDailyRow[] };
  return json.data ?? [];
}

export function cursorRowToEvent(
  row: CursorDailyRow,
  ctx: {
    organizationId: string;
    developerId: string;
    deviceId: string;
    connectorVersion: string;
    consentVersion: string;
  },
): ActivityEvent {
  const day = cursorRowDay(row);
  const occurredAt = new Date(`${day}T12:00:00.000Z`).toISOString();
  const who = row.userId ?? row.email ?? "unknown";
  const seed = `cursor:daily_usage:${day}:${who}:${ctx.organizationId}`;
  return {
    event_id: deterministicEventId(seed),
    schema_version: SCHEMA_VERSION,
    organization_id: ctx.organizationId,
    developer_id: ctx.developerId,
    device_id: ctx.deviceId,
    provider: "cursor",
    connector_version: ctx.connectorVersion,
    event_type: EventTypes.provider_daily_aggregate,
    occurred_at: occurredAt,
    consent_version: ctx.consentVersion,
    // Request and completion counts stay in their own keys. Cursor does not
    // report tokens here, so no token field is set.
    metadata: cleanMetadata({
      tier: "B",
      daily_only: true,
      aggregate_kind: "daily_usage",
      aggregate_day: day,
      provider_user_id: row.userId != null ? String(row.userId).slice(0, 64) : undefined,
      lines_added: row.totalLinesAdded,
      lines_deleted: row.totalLinesDeleted,
      completions_count: row.totalTabsAccepted,
      chat_requests_count: row.chatRequests,
      agent_requests_count: sum(row.agentRequests, row.composerRequests),
      billable_requests_count: sum(row.subscriptionIncludedReqs, row.usageBasedReqs, row.apiKeyReqs),
    }),
  };
}
