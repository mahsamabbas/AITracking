import { describe, expect, it } from "vitest";
import { claudeOtlpLogsToEvents } from "./otlp-claude.js";
import { claudeHookToEvents, type ConnectorContext } from "./claude-hook.js";

const ctx: ConnectorContext = {
  organizationId: "550e8400-e29b-41d4-a716-446655440010",
  developerId: "550e8400-e29b-41d4-a716-446655440011",
  deviceId: "550e8400-e29b-41d4-a716-446655440012",
  connectorVersion: "0.2.0",
  consentVersion: "1",
  provider: "claude_code",
};

const s = (key: string, v: string) => ({ key, value: { stringValue: v } });
const n = (key: string, v: number) => ({ key, value: { intValue: String(v) } });

function logs(records: { attributes: { key: string; value: object }[] }[]) {
  return { resourceLogs: [{ resource: { attributes: [s("service.name", "claude-code")] }, scopeLogs: [{ logRecords: records }] }] };
}

describe("claudeOtlpLogsToEvents", () => {
  it("maps api_request to a model call with real timing and tokens", () => {
    const [m] = claudeOtlpLogsToEvents(
      logs([{ attributes: [
        s("event.name", "api_request"), s("event.timestamp", "2026-09-23T10:00:05.000Z"),
        s("session.id", "sess-1"), s("request_id", "req_1"), s("model", "claude-opus-5"),
        n("input_tokens", 1200), n("output_tokens", 340), n("cache_read_tokens", 9000), n("duration_ms", 4100),
      ] }]),
      ctx,
    );
    expect(m.sessionKey).toBe("sess-1");
    expect(m.event.event_type).toBe("model_request_completed");
    expect(m.event.duration_ms).toBe(4100);
    expect(m.event.metadata).toMatchObject({
      token_input: 1200, token_output: 340, cache_read_tokens: 9000,
      model_name: "claude-opus-5", telemetry_source: "otel",
    });
  });

  it("never maps prompt or response events, even when content is enabled", () => {
    const mapped = claudeOtlpLogsToEvents(
      logs([
        { attributes: [s("event.name", "user_prompt"), s("prompt", "secret plan"), s("session.id", "x")] },
        { attributes: [s("event.name", "assistant_response"), s("session.id", "x")] },
        { attributes: [s("event.name", "api_response_body"), s("session.id", "x")] },
        { attributes: [s("event.name", "tool_result"), s("session.id", "x")] },
      ]),
      ctx,
    );
    expect(mapped).toHaveLength(0);
  });

  it("gives an export retry the same event id", () => {
    const rec = { attributes: [s("event.name", "api_request"), s("request_id", "req_9"), s("session.id", "a")] };
    const [a] = claudeOtlpLogsToEvents(logs([rec]), ctx);
    const [b] = claudeOtlpLogsToEvents(logs([rec]), ctx);
    expect(a.event.event_id).toBe(b.event.event_id);
  });

  it("marks api_error as a failed call without inventing tokens", () => {
    const [m] = claudeOtlpLogsToEvents(logs([{ attributes: [s("event.name", "api_error"), s("request_id", "r")] }]), ctx);
    expect(m.event.status).toBe("failed");
    expect(m.event.metadata?.token_input).toBeUndefined();
  });
});

describe("Antigravity hooks", () => {
  const ag = { ...ctx, provider: "antigravity" };
  it("maps invocations to model calls and tool hooks to tool calls", () => {
    expect(claudeHookToEvents({ hook_event_name: "PreInvocation", session_id: "c1", model: "gemini-3.6-flash" }, ag)[0]?.event_type).toBe("model_request_started");
    const [done] = claudeHookToEvents({ hook_event_name: "PostInvocation", session_id: "c1", model: "gemini-3.6-flash" }, ag);
    expect(done?.event_type).toBe("model_request_completed");
    expect(done?.metadata?.model_name).toBe("gemini-3.6-flash");
    const [tool] = claudeHookToEvents({ hook_event_name: "PostToolUse", session_id: "c1", tool_name: "run_command" }, ag);
    expect(tool?.metadata?.tool_category).toBe("shell");
  });

  it("does not count Antigravity's Stop as another model call", () => {
    expect(claudeHookToEvents({ hook_event_name: "Stop", session_id: "c1" }, ag)).toHaveLength(0);
  });
});
