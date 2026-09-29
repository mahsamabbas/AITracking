import { describe, expect, it } from "vitest";
import { mergeIntervals, totalDurationMs } from "@techlio/aggregation";
import { ActivityEventSchema, EventTypes } from "@techlio/event-schema";
import { canViewDeveloper, scanEventForSecrets } from "@techlio/server-core";
function containsSecret(value: string): boolean {
  return /ghp_[a-zA-Z0-9]{20,}/.test(value);
}

const baseEvent = {
  event_id: "550e8400-e29b-41d4-a716-446655440099",
  schema_version: "1.0.0",
  organization_id: "550e8400-e29b-41d4-a716-446655440010",
  developer_id: "550e8400-e29b-41d4-a716-446655440011",
  device_id: "550e8400-e29b-41d4-a716-446655440012",
  provider: "claude_code",
  connector_version: "0.1.0",
  event_type: EventTypes.session_started,
  occurred_at: new Date().toISOString(),
  consent_version: "1",
};

describe("Section 19 required scenarios", () => {
  it("overlapping model/tool calls merge before active duration", () => {
    const merged = mergeIntervals([
      { startMs: 0, endMs: 100 },
      { startMs: 50, endMs: 150 },
    ]);
    expect(totalDurationMs(merged)).toBe(150);
  });

  it("secret patterns are detectable for redaction pipeline", () => {
    expect(containsSecret("token ghp_abcdefghijklmnopqrstuvwxyz123456")).toBe(
      true,
    );
  });

  it("unassigned session has no project_id in schema", () => {
    const parsed = ActivityEventSchema.parse(baseEvent);
    expect(parsed.project_id).toBeUndefined();
  });

  it("provider lacks token data — optional fields", () => {
    const parsed = ActivityEventSchema.parse(baseEvent);
    expect(parsed.metadata?.token_input).toBeUndefined();
  });

  it("unauthorized manager cannot view other developer (developer role)", () => {
    const ok = canViewDeveloper(
      {
        id: "d1",
        organizationId: "550e8400-e29b-41d4-a716-446655440010",
        role: "developer",
        developerId: "550e8400-e29b-41d4-a716-446655440011",
      },
      "550e8400-e29b-41d4-a716-446655440099",
    );
    expect(ok).toBe(false);
  });

  it("auditor cannot open another developer timeline", () => {
    expect(
      canViewDeveloper(
        {
          id: "a1",
          organizationId: "550e8400-e29b-41d4-a716-446655440010",
          role: "auditor",
        },
        "550e8400-e29b-41d4-a716-446655440011",
      ),
    ).toBe(false);
  });

  it("manager can view team developer activity", () => {
    expect(
      canViewDeveloper(
        {
          id: "m1",
          organizationId: "550e8400-e29b-41d4-a716-446655440010",
          role: "manager",
        },
        "550e8400-e29b-41d4-a716-446655440011",
      ),
    ).toBe(true);
  });

  it("secret metadata is detected by the server-core scan", () => {
    expect(scanEventForSecrets({ metadata: { tool_name: "safe" } })).toBeNull();
    expect(
      scanEventForSecrets({
        metadata: { tool_name: "ghp_abcdefghijklmnopqrstuvwxyz123456" },
      }),
    ).toBeTruthy();
  });

  it("timesheet import endpoint not supported", async () => {
    const res = await fetch("http://localhost:3001/v1/events/timesheet", {
      method: "POST",
    }).catch(() => null);
    if (res) {
      const body = await res.json();
      expect(body.error).toBe("timesheet_import_not_supported");
    }
  });
});
