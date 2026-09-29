import { createHash } from "node:crypto";
import type { ActivityEvent } from "@techlio/event-schema";
import { and, eq, sql } from "drizzle-orm";
import { db } from "./db.js";
import { activityEvents, agentSessions, sessionContextVersions } from "./schema.js";
import { recomputeSessionMetrics } from "./sessions.js";
import { activityTypeOf } from "./activity.js";

const SESSION_END = new Set(["session_ended", "connector_stopped"]);

/** Only agent activity opens a session. Health and coverage events never do. */
const OPENS_SESSION = new Set(["session", "model", "tool", "engineering_check", "file_change"]);

/** Stable session id so one developer's events never attach to another person's session. */
function sessionIdForDeveloper(developerId: string, sessionId: string): string {
  const bytes = createHash("sha256").update(`${developerId}:${sessionId}`).digest();
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * FR-017 — groups events into sessions by developer, device, provider, and
 * context. Any session-bearing event opens the session so that a dropped
 * `session_started` never loses the activity that follows it.
 */
export async function applySessionization(event: ActivityEvent): Promise<void> {
  let sessionId = event.session_id;
  if (!sessionId) return;

  // A heartbeat or coverage event carrying a session id must not create a
  // phantom "agent session" — that would inflate session counts with time in
  // which the agent did nothing.
  if (!OPENS_SESSION.has(activityTypeOf(event.event_type))) {
    const exists = await db
      .select({ id: agentSessions.id })
      .from(agentSessions)
      .where(eq(agentSessions.id, sessionId));
    if (!exists[0]) return;
  }

  const owner = await db
    .select({ developerId: agentSessions.developerId })
    .from(agentSessions)
    .where(eq(agentSessions.id, sessionId));
  if (owner[0] && owner[0].developerId !== event.developer_id) {
    const remapped = sessionIdForDeveloper(event.developer_id, sessionId);
    await db
      .update(activityEvents)
      // The column is authoritative (payloads no longer carry session_id).
      .set({ sessionId: remapped })
      .where(
        and(
          eq(activityEvents.organizationId, event.organization_id),
          eq(activityEvents.developerId, event.developer_id),
          eq(activityEvents.sessionId, sessionId),
        ),
      );
    const foreignSessionId = sessionId;
    sessionId = remapped;
    await recomputeSessionMetrics(event.organization_id, foreignSessionId);
  }

  await db
    .insert(agentSessions)
    .values({
      id: sessionId,
      organizationId: event.organization_id,
      developerId: event.developer_id,
      deviceId: event.device_id,
      provider: event.provider,
      startedAt: new Date(event.occurred_at),
      lastEventAt: new Date(event.occurred_at),
      endedAt: null,
      projectId: event.project_id ?? null,
      workItemId: event.work_item_id ?? null,
      unassigned: !event.project_id,
    })
    .onConflictDoNothing();

  if (event.event_type === "task_context_changed") {
    const existing = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(sessionContextVersions)
      .where(eq(sessionContextVersions.sessionId, sessionId));
    await db.insert(sessionContextVersions).values({
      sessionId,
      organizationId: event.organization_id,
      projectId: event.project_id ?? null,
      workItemId: event.work_item_id ?? null,
      label: event.metadata?.path_category ?? null,
      version: (existing[0]?.count ?? 0) + 1,
      recordedAt: new Date(event.occurred_at),
    });
    await db
      .update(agentSessions)
      .set({
        projectId: event.project_id ?? null,
        workItemId: event.work_item_id ?? null,
        unassigned: !event.project_id,
      })
      .where(eq(agentSessions.id, sessionId));
  }

  if (SESSION_END.has(event.event_type)) {
    await db
      .update(agentSessions)
      .set({ endedAt: new Date(event.occurred_at) })
      .where(
        and(
          eq(agentSessions.id, sessionId),
          eq(agentSessions.organizationId, event.organization_id),
        ),
      );
  }

  if (event.event_type !== "heartbeat_sent") {
    await db
      .update(agentSessions)
      .set({ lastEventAt: new Date(event.occurred_at) })
      .where(eq(agentSessions.id, sessionId));
    await recomputeSessionMetrics(event.organization_id, sessionId);
  }
}
