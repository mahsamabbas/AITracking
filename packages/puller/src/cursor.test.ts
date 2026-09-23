import { describe, expect, it } from "vitest";
import { cursorRowToEvent } from "./cursor.js";

describe("cursorRowToEvent", () => {
  it("marks Tier B daily aggregate", () => {
    const e = cursorRowToEvent(
      { userId: 1, date: Date.UTC(2026, 8, 1), chatRequests: 5, subscriptionIncludedReqs: 3, usageBasedReqs: 2 },
      {
        organizationId: "550e8400-e29b-41d4-a716-446655440010",
        developerId: "550e8400-e29b-41d4-a716-446655440011",
        deviceId: "550e8400-e29b-41d4-a716-446655440012",
        connectorVersion: "0.1.0",
        consentVersion: "1",
      },
    );
    expect(e.metadata?.tier).toBe("B");
    expect(e.metadata?.daily_only).toBe(true);
    expect(e.metadata?.aggregate_kind).toBe("daily_usage");
    expect(e.metadata?.completions_count).toBeUndefined();
    expect(e.metadata?.chat_requests_count).toBe(5);
    expect(e.metadata?.billable_requests_count).toBe(5);
    expect(e.metadata?.aggregate_day).toBe("2026-09-01");
    // Request counts must never be relabelled as tokens.
    expect(e.metadata?.token_input).toBeUndefined();
    expect(e.metadata?.token_output).toBeUndefined();
  });

  it("uses stable event_id for same day and user", () => {
    const ctx = {
      organizationId: "550e8400-e29b-41d4-a716-446655440010",
      developerId: "550e8400-e29b-41d4-a716-446655440011",
      deviceId: "550e8400-e29b-41d4-a716-446655440012",
      connectorVersion: "0.1.0",
      consentVersion: "1",
    };
    const a = cursorRowToEvent({ userId: 9, date: Date.UTC(2026, 8, 1) }, ctx);
    const b = cursorRowToEvent({ userId: 9, date: Date.UTC(2026, 8, 1) }, ctx);
    expect(a.event_id).toBe(b.event_id);
  });
});
