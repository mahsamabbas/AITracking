import { sql } from "drizzle-orm";
import { db } from "./db.js";
import { activityTypeOf } from "./activity.js";
import type { DateRange } from "./analytics.js";
import { fullEventFromSql } from "./retention/payload.js";
import { LATE_EVENT_MS } from "./sessions.js";

/**
 * The activity feed: every agent event in the selected range, newest first,
 * with keyset pagination so "Today" really is the whole day. Connector
 * heartbeats and IDE keep-alive pulses are not activity and never appear.
 */

/** Event types that are liveness signals, not something an agent did. */
const NOT_ACTIVITY = ["heartbeat_sent", "session_heartbeat"];

export interface FeedEvent {
  event_id: string;
  event_type: string;
  activity_type: string;
  occurred_at: string;
  received_at: string;
  late: boolean;
  provider: string | null;
  session_id: string | null;
  status: string | null;
  duration_ms: number | null;
  metadata: Record<string, unknown> | null;
  developer_id: string;
  developer_name: string | null;
}

export interface ActivityFeed {
  events: FeedEvent[];
  /** Pass back as `cursor` to load the next (older) page; null when done. */
  nextCursor: string | null;
  /** All activity events in the range (not just this page). */
  total: number;
  range: { from: string; to: string };
}


function encodeCursor(occurredAt: string, eventId: string): string {
  return Buffer.from(`${occurredAt}|${eventId}`).toString("base64url");
}

function decodeCursor(cursor: string | undefined): { at: Date; id: string } | null {
  if (!cursor) return null;
  try {
    const [at, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
    const date = new Date(at);
    if (Number.isNaN(date.getTime()) || !/^[0-9a-f-]{36}$/i.test(id)) return null;
    return { at: date, id };
  } catch {
    return null;
  }
}

export async function listActivityFeed(input: {
  organizationId: string;
  range: DateRange;
  /** Restrict to these developers (developer role: only themselves). */
  developerIds?: string[];
  provider?: string;
  /** Employees' team (organisation feeds filtered by team). */
  team?: string;
  cursor?: string;
  limit?: number;
}): Promise<ActivityFeed> {
  const { organizationId, range } = input;
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const after = decodeCursor(input.cursor);
  const devs = input.developerIds;
  const provider = input.provider ?? null;
  const emptyRange = { from: range.from.toISOString(), to: range.to.toISOString() };
  // A developer account with no linked employee sees nothing, never everyone.
  if (devs && devs.length === 0) return { events: [], nextCursor: null, total: 0, range: emptyRange };

  const scope = sql`
    e.organization_id = ${organizationId}
    AND e.occurred_at >= ${range.from} AND e.occurred_at < ${range.to}
    AND e.event_type NOT IN (${sql.join(NOT_ACTIVITY.map((t) => sql`${t}`), sql`, `)})
    ${devs ? sql`AND e.developer_id IN (${sql.join(devs.map((d) => sql`${d}::uuid`), sql`, `)})` : sql``}
    ${provider ? sql`AND e.payload->>'provider' = ${provider}` : sql``}
    ${input.team ? sql`AND emp.team = ${input.team}` : sql``}
  `;

  const [page, count] = await Promise.all([
    db.execute<{
      event_id: string;
      occurred_at: Date;
      received_at: Date;
      developer_id: string;
      session_id: string | null;
      event_type: string;
      payload: Record<string, unknown>;
      display_name: string | null;
    }>(sql`
      SELECT e.event_id, e.occurred_at, e.received_at, e.developer_id, e.session_id, e.event_type, e.payload, emp.display_name
      FROM activity_events e
      LEFT JOIN employees emp ON emp.id = e.developer_id
      WHERE ${scope}
        ${after ? sql`AND (e.occurred_at, e.event_id) < (${after.at}, ${after.id}::uuid)` : sql``}
      ORDER BY e.occurred_at DESC, e.event_id DESC
      LIMIT ${limit + 1}
    `),
    db.execute<{ n: number }>(sql`
      SELECT COUNT(*)::int AS n FROM activity_events e
      LEFT JOIN employees emp ON emp.id = e.developer_id
      WHERE ${scope}
    `),
  ]);

  const rows = page.rows.slice(0, limit);
  const events: FeedEvent[] = rows.map((r) => {
    const p = fullEventFromSql(r) as {
      event_type?: string;
      provider?: string;
      session_id?: string;
      status?: string;
      duration_ms?: number;
      metadata?: Record<string, unknown>;
    };
    const occurred = new Date(r.occurred_at);
    const received = new Date(r.received_at);
    const type = p.event_type ?? "";
    return {
      event_id: r.event_id,
      event_type: type,
      activity_type: activityTypeOf(type),
      occurred_at: occurred.toISOString(),
      received_at: received.toISOString(),
      late: received.getTime() - occurred.getTime() > LATE_EVENT_MS,
      provider: p.provider ?? null,
      session_id: p.session_id ?? null,
      status: p.status ?? null,
      duration_ms: typeof p.duration_ms === "number" ? p.duration_ms : null,
      metadata: p.metadata ?? null,
      developer_id: r.developer_id,
      developer_name: r.display_name,
    };
  });
  const last = rows[rows.length - 1];
  return {
    events,
    nextCursor:
      page.rows.length > limit && last ? encodeCursor(new Date(last.occurred_at).toISOString(), last.event_id) : null,
    total: count.rows[0]?.n ?? 0,
    range: emptyRange,
  };
}
