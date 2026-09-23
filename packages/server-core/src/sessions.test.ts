import { describe, expect, it } from "vitest";
import type { ActivityEvent } from "@techlio/event-schema";
import { computeSessionMetrics } from "./sessions.js";

const BASE = {
  schema_version: "1.0.0" as const,
  organization_id: "550e8400-e29b-41d4-a716-446655440010",
  developer_id: "550e8400-e29b-41d4-a716-446655440011",
  device_id: "550e8400-e29b-41d4-a716-446655440012",
  provider: "claude_code",
  connector_version: "0.4.2",
  session_id: "550e8400-e29b-41d4-a716-446655440013",
  consent_version: "1",
};

let counter = 0;
function ev(
  event_type: string,
  atMs: number,
  extra: Partial<ActivityEvent> = {},
): ActivityEvent {
  counter++;
  return {
    ...BASE,
    event_id: `550e8400-e29b-41d4-a716-${String(counter).padStart(12, "0")}`,
    event_type,
    occurred_at: new Date(atMs).toISOString(),
    ...extra,
  } as ActivityEvent;
}

const T0 = Date.UTC(2026, 8, 18, 9, 0, 0);
const S = 1000;
const M = 60 * S;

describe("computeSessionMetrics", () => {
  it("merges overlapping model and tool intervals before summing active time", () => {
    // A model call 0–30s and a tool call 20–40s overlap by 10s.
    const events = [
      ev("session_started", T0),
      ev("model_request_completed", T0 + 30 * S, { duration_ms: 30 * S }),
      ev("tool_completed", T0 + 40 * S, {
        duration_ms: 20 * S,
        metadata: { tool_category: "shell" },
      }),
      ev("session_ended", T0 + 60 * S),
    ];

    const m = computeSessionMetrics(events);

    expect(m.modelDurationMs).toBe(30 * S);
    expect(m.toolDurationMs).toBe(20 * S);
    // Union of 0–30s and 20–40s is 40s, not the 50s naive sum.
    expect(m.activeDurationMs).toBe(40 * S);
    expect(m.activeDurationMs).toBeLessThan(m.modelDurationMs + m.toolDurationMs);
  });

  it("excludes gaps over the idle threshold from the interactive span", () => {
    const events = [
      ev("session_started", T0),
      ev("tool_completed", T0 + 2 * M, {
        duration_ms: 5 * S,
        metadata: { tool_category: "search" },
      }),
      // 45-minute gap — well past the 10-minute threshold.
      ev("tool_completed", T0 + 47 * M, {
        duration_ms: 5 * S,
        metadata: { tool_category: "search" },
      }),
      ev("session_ended", T0 + 50 * M),
    ];

    const m = computeSessionMetrics(events);

    expect(m.elapsedSpanMs).toBe(50 * M);
    expect(m.interactiveSpanMs).toBe(5 * M); // 0–2m plus 47–50m
    expect(m.idleDurationMs).toBe(45 * M);
    expect(m.elapsedSpanMs).toBe(m.interactiveSpanMs + m.idleDurationMs);
  });

  it("classifies a session with engineering checks as engineering output", () => {
    const events = [
      ev("session_started", T0),
      ev("tool_completed", T0 + 30 * S, {
        duration_ms: 10 * S,
        metadata: { tool_category: "file_write" },
      }),
      ev("file_modified", T0 + 31 * S, { metadata: { path_category: "src/api" } }),
      ev("test_completed", T0 + 90 * S, {
        duration_ms: 20 * S,
        status: "succeeded",
        metadata: { test_passed: 42, test_failed: 0 },
      }),
      ev("session_ended", T0 + 2 * M),
    ];

    const m = computeSessionMetrics(events);

    expect(m.classification).toBe("engineering_output");
    expect(m.testsRun).toBe(1);
    expect(m.testsPassed).toBe(42);
    expect(m.fileChanges).toBe(1);
  });

  it("classifies file changes without checks as assisted editing", () => {
    const events = [
      ev("session_started", T0),
      ev("file_modified", T0 + 20 * S),
      ev("session_ended", T0 + M),
    ];
    expect(computeSessionMetrics(events).classification).toBe("assisted_editing");
  });

  it("classifies a mostly-empty long span as idle-dominant", () => {
    const events = [
      ev("session_started", T0),
      ev("tool_completed", T0 + 30 * S, {
        duration_ms: 5 * S,
        metadata: { tool_category: "search" },
      }),
      ev("session_ended", T0 + 90 * M),
    ];
    const m = computeSessionMetrics(events);
    expect(m.classification).toBe("idle_dominant");
    expect(m.idleDurationMs).toBeGreaterThan(m.elapsedSpanMs * 0.5);
  });

  it("reports missing token data as null, never as zero", () => {
    const withoutTokens = computeSessionMetrics([
      ev("session_started", T0),
      ev("model_request_completed", T0 + 10 * S, { duration_ms: 10 * S }),
    ]);
    expect(withoutTokens.tokenInput).toBeNull();
    expect(withoutTokens.tokenOutput).toBeNull();

    const withTokens = computeSessionMetrics([
      ev("session_started", T0),
      ev("model_request_completed", T0 + 10 * S, {
        duration_ms: 10 * S,
        metadata: { token_input: 100, token_output: 20 },
      }),
    ]);
    expect(withTokens.tokenInput).toBe(100);
    expect(withTokens.tokenOutput).toBe(20);
  });

  it("marks a session containing a telemetry gap as incomplete coverage", () => {
    const m = computeSessionMetrics([
      ev("session_started", T0),
      ev("telemetry_gap_started", T0 + M, { metadata: { gap_reason: "paused" } }),
      ev("telemetry_gap_ended", T0 + 20 * M),
      ev("session_ended", T0 + 21 * M),
    ]);
    expect(m.coverageState).toBe("gap");
  });

  it("collects models and tool categories used", () => {
    const m = computeSessionMetrics([
      ev("session_started", T0),
      ev("model_request_completed", T0 + 10 * S, {
        duration_ms: 5 * S,
        metadata: { model_name: "claude-opus-5" },
      }),
      ev("model_request_completed", T0 + 30 * S, {
        duration_ms: 5 * S,
        metadata: { model_name: "claude-opus-5" },
      }),
      ev("tool_completed", T0 + 40 * S, {
        duration_ms: S,
        metadata: { tool_category: "file_read" },
      }),
      ev("tool_completed", T0 + 45 * S, {
        duration_ms: S,
        metadata: { tool_category: "file_read" },
      }),
      ev("tool_completed", T0 + 50 * S, {
        duration_ms: S,
        metadata: { tool_category: "shell" },
      }),
    ]);
    expect(m.modelsUsed).toEqual(["claude-opus-5"]);
    expect(m.toolCategories).toEqual({ file_read: 2, shell: 1 });
    expect(m.modelRequests).toBe(2);
    expect(m.toolCalls).toBe(3);
  });

  it("returns zeroed metrics for an empty event list", () => {
    const m = computeSessionMetrics([]);
    expect(m.activeDurationMs).toBe(0);
    expect(m.elapsedSpanMs).toBe(0);
    expect(m.startedAt).toBeNull();
  });

  it("ignores connector heartbeats and lifecycle events that carry the session id", () => {
    // One minute of agent work, then the laptop stays on for 8 hours sending
    // heartbeats stamped with the same session id.
    const events = [
      ev("session_started", T0),
      ev("model_request_completed", T0 + 30 * S, { duration_ms: 30 * S }),
      ev("tool_completed", T0 + 60 * S, { duration_ms: 20 * S, metadata: { tool_category: "shell" } }),
      ...Array.from({ length: 16 * 8 }, (_, i) => ev("heartbeat_sent", T0 + 2 * M + i * 225 * S)),
      ev("connector_paused", T0 + 8 * 60 * M),
      ev("connector_stopped", T0 + 8 * 60 * M + S),
    ];

    const m = computeSessionMetrics(events);

    expect(m.elapsedSpanMs).toBe(60 * S);
    expect(m.eventCount).toBe(3);
    expect(m.lastEventAt?.getTime()).toBe(T0 + 60 * S);
    // The pause happened hours after the session's agent activity ended.
    expect(m.coverageState).toBe("complete");
  });

  it("marks a gap when collection paused during the session's agent activity", () => {
    const events = [
      ev("model_request_completed", T0 + 30 * S, { duration_ms: 30 * S }),
      ev("connector_paused", T0 + 2 * M),
      ev("tool_completed", T0 + 10 * M, { duration_ms: 20 * S, metadata: { tool_category: "shell" } }),
    ];
    expect(computeSessionMetrics(events).coverageState).toBe("gap");
  });
});
