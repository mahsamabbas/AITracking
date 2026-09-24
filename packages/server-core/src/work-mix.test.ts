import { describe, expect, it } from "vitest";
import { computeWorkMix, type MixEvent } from "./work-mix.js";

const T0 = Date.UTC(2026, 8, 24, 9, 0, 0);
const M = 60_000;
const ev = (type: string, atMin: number, durMin: number, metadata: MixEvent["metadata"] = null): MixEvent => ({
  occurred_at: new Date(T0 + atMin * M),
  event_type: type,
  duration_ms: durMin * M,
  metadata,
});

describe("computeWorkMix — one session, several kinds of work", () => {
  // One Cursor session: 10 min planning (model + reads), 5 min writing, an
  // 8-minute idle stretch, then a 2-minute test run.
  const events = [
    ev("model_request_completed", 6, 6),
    ev("tool_completed", 10, 4, { tool_category: "file_read", tool_name: "Read" }),
    ev("tool_completed", 15, 5, { tool_category: "file_write", tool_name: "Edit" }),
    ev("file_modified", 15, 0, { tool_name: "Edit", telemetry_source: "hook" }),
    ev("tool_completed", 25, 2, { tool_category: "test", tool_name: "Bash" }),
    // A person's own save (no agent tool name) and a keep-alive never count.
    ev("file_modified", 26, 0, { file_path: "a.ts" } as never),
    ev("session_heartbeat", 40, 0),
  ];
  const m = computeWorkMix(events);

  it("splits the session's time instead of labelling it all 'writing code'", () => {
    expect(m.researchMs).toBe(10 * M);
    expect(m.writingMs).toBe(5 * M);
    expect(m.verifyMs).toBe(2 * M);
    expect(m.activeMs).toBe(17 * M);
  });

  it("counts the quiet stretch inside the working period as idle", () => {
    expect(m.workingMs).toBe(25 * M);
    expect(m.idleMs).toBe(8 * M);
  });

  it("counts overlapping work once, verify over writing over research", () => {
    const overlap = computeWorkMix([
      ev("tool_completed", 10, 10, { tool_category: "file_write" }),
      ev("tool_completed", 10, 4, { tool_category: "build" }),
      ev("model_request_completed", 10, 10),
    ]);
    expect(overlap.activeMs).toBe(10 * M);
    expect(overlap.verifyMs).toBe(4 * M);
    expect(overlap.writingMs).toBe(6 * M);
    expect(overlap.researchMs).toBe(0);
  });
});
