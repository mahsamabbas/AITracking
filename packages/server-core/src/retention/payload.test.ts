import { describe, expect, it } from "vitest";
import type { ActivityEvent } from "@techlio/event-schema";
import { COLUMN_KEYS, fullEvent, fullEventFromSql, slimPayload } from "./payload.js";
import { LONG_LIVED_SQL, rawCutoff, retentionPolicy } from "./policy.js";

const event = {
  event_id: "11111111-1111-4111-8111-111111111111",
  organization_id: "22222222-2222-4222-8222-222222222222",
  developer_id: "33333333-3333-4333-8333-333333333333",
  device_id: "44444444-4444-4444-8444-444444444444",
  session_id: "55555555-5555-4555-8555-555555555555",
  event_type: "tool_completed",
  occurred_at: "2026-09-23T17:22:31.279Z",
  provider: "cursor",
  duration_ms: 258,
  status: "succeeded",
  schema_version: "1.0.0",
  metadata: { tool_name: "Grep", tool_category: "file_read" },
} as unknown as ActivityEvent;

const row = {
  eventId: event.event_id,
  organizationId: event.organization_id,
  developerId: event.developer_id,
  deviceId: event.device_id,
  sessionId: event.session_id ?? null,
  eventType: event.event_type,
  occurredAt: new Date(event.occurred_at),
};

describe("slim event payloads", () => {
  it("stores no field that a column already holds", () => {
    const slim = slimPayload(event);
    for (const key of COLUMN_KEYS) expect(slim).not.toHaveProperty(key);
    expect(slim).toMatchObject({ provider: "cursor", duration_ms: 258, metadata: { tool_name: "Grep" } });
  });

  it("restores the complete event from columns + slim payload (lossless)", () => {
    expect(fullEvent({ ...row, payload: slimPayload(event) })).toEqual(event);
    expect(fullEventFromSql({
      event_id: row.eventId,
      organization_id: row.organizationId,
      developer_id: row.developerId,
      device_id: row.deviceId,
      session_id: row.sessionId,
      event_type: row.eventType,
      occurred_at: row.occurredAt,
      payload: slimPayload(event),
    })).toEqual(event);
  });

  it("prefers columns over a stale copy in an old full payload (e.g. a remapped session)", () => {
    const remapped = "66666666-6666-4666-8666-666666666666";
    const restored = fullEvent({ ...row, sessionId: remapped, payload: event });
    expect(restored.session_id).toBe(remapped);
  });
});

describe("retention policy", () => {
  it("defaults to 14 days of raw events and cuts at a UTC day boundary", () => {
    expect(retentionPolicy().rawEventDays).toBe(14);
    const cutoff = rawCutoff(new Date("2026-09-29T15:30:00Z"));
    expect(cutoff.toISOString()).toBe("2026-09-15T00:00:00.000Z");
  });

  it("keeps commits and coverage events past the raw window", () => {
    const sqlText = LONG_LIVED_SQL("e");
    for (const t of ["commit_created", "commit_pushed", "telemetry_gap_started", "provider_daily_aggregate"]) {
      expect(sqlText).toContain(`'${t}'`);
    }
    expect(sqlText).toContain("git_commit");
  });
});
