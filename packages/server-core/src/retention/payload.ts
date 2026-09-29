import type { ActivityEvent } from "@techlio/event-schema";

/**
 * activity_events stores these as typed columns. Keeping a second copy inside
 * `payload` (as UUID/ISO strings plus key names) was ~65% of every row, so
 * they are stripped on write and restored from the columns on read. Columns
 * are authoritative (e.g. a remapped session id).
 */
export const COLUMN_KEYS = [
  "event_id",
  "organization_id",
  "developer_id",
  "device_id",
  "session_id",
  "event_type",
  "occurred_at",
] as const;

/** Payload to store: the event minus fields already held in columns. */
export function slimPayload(event: ActivityEvent): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(event as unknown as Record<string, unknown>) };
  for (const key of COLUMN_KEYS) delete out[key];
  return out;
}

/** Drizzle row shape (camelCase columns). */
export interface EventRow {
  eventId: string;
  organizationId: string;
  developerId: string;
  deviceId: string;
  sessionId: string | null;
  eventType: string;
  occurredAt: Date;
  payload: unknown;
}

/** The complete event from a stored row — old full payloads and slim ones alike. */
export function fullEvent(row: EventRow): ActivityEvent {
  const p = (row.payload ?? {}) as Record<string, unknown>;
  return {
    ...p,
    event_id: row.eventId,
    organization_id: row.organizationId,
    developer_id: row.developerId,
    device_id: row.deviceId,
    ...(row.sessionId ? { session_id: row.sessionId } : {}),
    event_type: row.eventType,
    occurred_at: row.occurredAt.toISOString(),
  } as unknown as ActivityEvent;
}

/** Same, for raw SQL rows (snake_case columns; occurred_at may be a string). */
export function fullEventFromSql(row: {
  event_id: string;
  organization_id?: string;
  developer_id: string;
  device_id?: string;
  session_id?: string | null;
  event_type: string;
  occurred_at: Date | string;
  payload: unknown;
}): Record<string, unknown> {
  const p = (row.payload ?? {}) as Record<string, unknown>;
  return {
    ...p,
    event_id: row.event_id,
    ...(row.organization_id ? { organization_id: row.organization_id } : {}),
    developer_id: row.developer_id,
    ...(row.device_id ? { device_id: row.device_id } : {}),
    ...(row.session_id ? { session_id: row.session_id } : {}),
    event_type: row.event_type,
    occurred_at: new Date(row.occurred_at).toISOString(),
  };
}

/** SQL expression (alias `e`): the complete event as JSONB, for archives. */
export const FULL_EVENT_SQL = (alias = "e") =>
  `(${alias}.payload || jsonb_strip_nulls(jsonb_build_object(` +
  `'event_id', ${alias}.event_id, 'organization_id', ${alias}.organization_id, ` +
  `'developer_id', ${alias}.developer_id, 'device_id', ${alias}.device_id, ` +
  `'session_id', ${alias}.session_id, 'event_type', ${alias}.event_type, ` +
  `'occurred_at', to_char(${alias}.occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), ` +
  `'received_at', to_char(${alias}.received_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))))`;

/** Bulk-slim rows written before this change (bounded batch; returns rows updated). */
export const SLIM_BATCH_SQL = (batch: number) => `
  UPDATE activity_events SET payload = payload - ARRAY[${COLUMN_KEYS.map((k) => `'${k}'`).join(", ")}]
  WHERE ctid IN (SELECT ctid FROM activity_events WHERE payload ? 'event_id' LIMIT ${Math.max(1, Math.floor(batch))})`;
