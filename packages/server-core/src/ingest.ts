import { randomUUID } from "node:crypto";
import { ActivityEventSchema, type ActivityEvent } from "@techlio/event-schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "./db.js";
import { activityEvents, auditLog, hourlySnapshots } from "./schema.js";
import { fullEvent, slimPayload } from "./retention/payload.js";
import { scanEventForSecrets } from "./security.js";
import { applySessionization } from "./sessionize.js";
import { isRemotelyPaused, recordLiveHeartbeat } from "./devices.js";
import { hourStartUtc } from "./time-utils.js";

/**
 * Recently accepted event ids (fast replay rejection within this process).
 * Bounded: the database's ON CONFLICT is the real duplicate guard, and an
 * unbounded set grew by one entry per event forever in long-lived processes.
 */
const seenEvents = new Set<string>();
const SEEN_EVENTS_MAX = 50_000;

export type RecalcCallback = (job: {
  organizationId: string;
  developerId: string;
  hour: string;
  version: number;
  reason: string;
}) => void | Promise<void>;

let onLateRecalc: RecalcCallback | null = null;

export function setLateRecalcHandler(handler: RecalcCallback | null): void {
  onLateRecalc = handler;
}


async function maybeScheduleLateRecalc(event: ActivityEvent): Promise<void> {
  const occurred = new Date(event.occurred_at);
  const eventHour = hourStartUtc(occurred);
  const currentHour = hourStartUtc(new Date());
  if (eventHour >= currentHour) return;

  const existing = await db
    .select()
    .from(hourlySnapshots)
    .where(
      and(
        eq(hourlySnapshots.organizationId, event.organization_id),
        eq(hourlySnapshots.developerId, event.developer_id),
        eq(hourlySnapshots.hourStart, eventHour),
      ),
    )
    .orderBy(desc(hourlySnapshots.version))
    .limit(1);

  if (existing.length === 0) return;
  const latest = existing[0];
  const nextVersion = latest.version + 1;
  await onLateRecalc?.({
    organizationId: event.organization_id,
    developerId: event.developer_id,
    hour: eventHour.toISOString(),
    version: nextVersion,
    reason: "late_event_received",
  });
}

export interface IngestAuth {
  /** The developer the authenticating device belongs to; every event must be theirs. */
  developerId?: string;
  /** Only provider_pull devices (the worker) may submit Tier B daily aggregates. */
  allowTierB?: boolean;
}

/** Still accepted while paused: they describe the pause and the connector's health. */
const PAUSE_LIFECYCLE_EVENTS = new Set([
  "heartbeat_sent",
  "connector_paused",
  "connector_resumed",
  "telemetry_gap_started",
  "telemetry_gap_ended",
]);

export async function ingestBatch(
  organizationId: string,
  body: unknown,
  deviceIdFromAuth?: string,
  auth?: IngestAuth,
): Promise<{ accepted: number; rejected: number; reasons?: string[] }> {
  // Validate per event: one malformed event must not discard the valid rest of
  // the batch (the connector deletes a batch once the API answers 2xx).
  const raw = (body as { events?: unknown[] } | null)?.events;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 500) {
    return { accepted: 0, rejected: 1, reasons: ["schema"] };
  }

  let accepted = 0;
  let rejected = 0;
  const reasons: string[] = [];
  // Paused from the dashboard: the device's activity is not collected until
  // resumed there (older connectors keep uploading; this makes pause real).
  const remotePaused = deviceIdFromAuth && auth ? await isRemotelyPaused(deviceIdFromAuth) : false;
  const lateHours = new Map<string, ActivityEvent>();

  for (const candidate of raw) {
    const parsedEvent = ActivityEventSchema.safeParse(candidate);
    if (!parsedEvent.success) {
      rejected++;
      const issue = parsedEvent.error.issues[0];
      reasons.push(`schema:${issue?.path.join(".") || "event"}`);
      continue;
    }
    const event = parsedEvent.data;
    if (event.organization_id !== organizationId) {
      rejected++;
      reasons.push("org_mismatch");
      continue;
    }
    if (deviceIdFromAuth && event.device_id !== deviceIdFromAuth) {
      rejected++;
      reasons.push("device_mismatch");
      continue;
    }
    if (auth?.developerId && event.developer_id !== auth.developerId) {
      rejected++;
      reasons.push("developer_mismatch");
      continue;
    }
    if (auth && !auth.allowTierB && event.event_type === "provider_daily_aggregate") {
      rejected++;
      reasons.push("tier_b_not_allowed");
      continue;
    }
    if (remotePaused && !PAUSE_LIFECYCLE_EVENTS.has(event.event_type)) {
      rejected++;
      reasons.push("remote_paused");
      continue;
    }
    if (seenEvents.has(event.event_id)) {
      rejected++;
      reasons.push("replay");
      continue;
    }
    const secretHit = scanEventForSecrets(event);
    if (secretHit) {
      rejected++;
      reasons.push(`secret:${secretHit}`);
      await db.insert(auditLog).values({
        organizationId,
        action: "events.rejected_secret",
        detail: { eventId: event.event_id, reason: secretHit },
        createdAt: new Date(),
      });
      continue;
    }
    try {
      const insertResult = await db
        .insert(activityEvents)
        .values({
          eventId: event.event_id,
          organizationId: event.organization_id,
          developerId: event.developer_id,
          deviceId: event.device_id,
          sessionId: event.session_id ?? null,
          eventType: event.event_type,
          occurredAt: new Date(event.occurred_at),
          receivedAt: new Date(),
          // Columns already hold ids, type, and time; store the rest (see retention/payload.ts).
          payload: slimPayload(event),
        })
        .onConflictDoNothing()
        .returning({ eventId: activityEvents.eventId });

      if (insertResult.length === 0) {
        rejected++;
        reasons.push("duplicate");
        continue;
      }

      seenEvents.add(event.event_id);
      if (seenEvents.size > SEEN_EVENTS_MAX) {
        // Sets iterate in insertion order: drop the oldest.
        seenEvents.delete(seenEvents.values().next().value as string);
      }
      accepted++;

      await applySessionization(event);
      // One recalculation per (person, hour) per batch, after the batch is stored.
      lateHours.set(`${event.developer_id}|${hourStartUtc(new Date(event.occurred_at)).toISOString()}`, event);

      if (
        event.event_type === "heartbeat_sent" ||
        event.event_type === "connector_paused" ||
        event.event_type === "connector_resumed"
      ) {
        const paused =
          event.event_type === "connector_paused" ||
          event.metadata?.connector_paused === true
            ? true
            : event.event_type === "connector_resumed"
              ? false
              : undefined;
        await recordLiveHeartbeat({
          deviceId: event.device_id,
          organizationId: event.organization_id,
          developerId: event.developer_id,
          version: event.connector_version,
          queueDepth: event.metadata?.queue_depth,
          paused,
          provider: event.provider,
        });
      }

      if (
        event.event_type === "telemetry_gap_started" ||
        event.event_type === "connector_paused"
      ) {
        await db.insert(auditLog).values({
          organizationId,
          action: "coverage.gap",
          detail: {
            deviceId: event.device_id,
            reason: event.metadata?.gap_reason ?? "paused",
          },
          createdAt: new Date(),
        });
      }
    } catch {
      rejected++;
      reasons.push("db_error");
    }
  }

  // Awaited: on serverless hosts work left running after the response can be
  // frozen or dropped, leaving the earlier hourly snapshot as the latest.
  for (const event of lateHours.values()) {
    await maybeScheduleLateRecalc(event).catch((err) => console.error("[late-recalc]", err));
  }

  // Only rejections are audit-worthy. A row per accepted upload (connectors
  // upload every few seconds) outgrew the events themselves.
  if (rejected > 0) {
    await db.insert(auditLog).values({
      organizationId,
      action: "events.batch_ingest",
      detail: { accepted, rejected },
      createdAt: new Date(),
    });
  }

  return { accepted, rejected, reasons: reasons.length ? reasons : undefined };
}

export async function listRecentEvents(
  organizationId: string,
  limit = 50,
  filters?: {
    developerId?: string;
    eventType?: string;
    provider?: string;
  },
): Promise<ActivityEvent[]> {
  const rows = await db
    .select()
    .from(activityEvents)
    .where(eq(activityEvents.organizationId, organizationId))
    .orderBy(desc(activityEvents.receivedAt))
    .limit(limit * 3);

  let events = rows.map((r) => fullEvent(r));
  if (filters?.developerId) {
    events = events.filter((e) => e.developer_id === filters.developerId);
  }
  if (filters?.eventType) {
    events = events.filter((e) => e.event_type === filters.eventType);
  }
  if (filters?.provider) {
    events = events.filter((e) => e.provider === filters.provider);
  }

  events.sort((a, b) => {
    const aHb = a.event_type === "heartbeat_sent" ? 1 : 0;
    const bHb = b.event_type === "heartbeat_sent" ? 1 : 0;
    if (aHb !== bHb) return aHb - bHb;
    return (
      new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime()
    );
  });

  return events.slice(0, limit);
}

export async function recordSessionContext(input: {
  organizationId: string;
  sessionId: string;
  projectId?: string;
  workItemId?: string;
  label?: string;
  developerId: string;
  deviceId: string;
}): Promise<ActivityEvent> {
  // A project / work item must belong to the same organisation (tenant isolation).
  if (input.projectId) {
    const p = await db.execute(
      sql`SELECT 1 FROM projects WHERE id = ${input.projectId} AND organization_id = ${input.organizationId}`,
    );
    if (!p.rows.length) throw new Error("project_not_found");
  }
  if (input.workItemId) {
    const w = await db.execute(
      sql`SELECT 1 FROM work_items WHERE id = ${input.workItemId} AND organization_id = ${input.organizationId}`,
    );
    if (!w.rows.length) throw new Error("work_item_not_found");
  }
  const event: ActivityEvent = {
    event_id: randomUUID(),
    schema_version: "1.0.0",
    organization_id: input.organizationId,
    developer_id: input.developerId,
    device_id: input.deviceId,
    provider: "companion",
    connector_version: "0.1.0",
    session_id: input.sessionId,
    project_id: input.projectId,
    work_item_id: input.workItemId,
    event_type: "task_context_changed",
    occurred_at: new Date().toISOString(),
    consent_version: "1",
    metadata: input.label ? { path_category: input.label } : undefined,
  };
  await ingestBatch(input.organizationId, { events: [event] });
  return event;
}
