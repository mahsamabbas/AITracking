import { randomUUID } from "node:crypto";
import { ActivityEventSchema, type ActivityEvent } from "@techlio/event-schema";
import { and, desc, eq } from "drizzle-orm";
import { db } from "./db.js";
import { activityEvents, auditLog, hourlySnapshots } from "./schema.js";
import { scanEventForSecrets } from "./security.js";
import { applySessionization } from "./sessionize.js";
import { recordLiveHeartbeat } from "./devices.js";

const seenEvents = new Set<string>();

export type RecalcCallback = (job: {
  organizationId: string;
  developerId: string;
  hour: string;
  version: number;
  reason: string;
}) => void;

let onLateRecalc: RecalcCallback | null = null;

export function setLateRecalcHandler(handler: RecalcCallback | null): void {
  onLateRecalc = handler;
}

function hourStartUtc(d: Date): Date {
  return new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
      d.getUTCHours(),
    ),
  );
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
  onLateRecalc?.({
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
          payload: event,
        })
        .onConflictDoNothing()
        .returning({ eventId: activityEvents.eventId });

      if (insertResult.length === 0) {
        rejected++;
        reasons.push("duplicate");
        continue;
      }

      seenEvents.add(event.event_id);
      accepted++;

      await applySessionization(event);
      void maybeScheduleLateRecalc(event);

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
          queueDepth: event.metadata?.queue_depth ?? 0,
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

  if (accepted > 0 || rejected > 0) {
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
    .select({ payload: activityEvents.payload })
    .from(activityEvents)
    .where(eq(activityEvents.organizationId, organizationId))
    .orderBy(desc(activityEvents.receivedAt))
    .limit(limit * 3);

  let events = rows.map((r) => r.payload as ActivityEvent);
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
