import { createHash } from "node:crypto";
import type { ActivityEvent } from "@techlio/event-schema";
import { EventTypes, SCHEMA_VERSION } from "@techlio/event-schema";
import type { ConnectorContext } from "./claude-hook.js";

/**
 * Claude Code OpenTelemetry logs (OTLP/HTTP JSON) → normalized events.
 *
 * Only `claude_code.api_request` and `claude_code.api_error` are mapped: they
 * carry per-call model timing, model id, and token counts. Every other event
 * (user_prompt, assistant_response, api_response_body, tool_result …) is
 * ignored, so prompt or response text can never be stored even if a user turns
 * on OTEL_LOG_USER_PROMPTS. Tool calls already arrive through hooks.
 *
 * Reference: https://code.claude.com/docs/en/monitoring-usage
 */

type OtlpValue = {
  stringValue?: string;
  intValue?: string | number;
  doubleValue?: number;
  boolValue?: boolean;
};
type OtlpAttribute = { key: string; value?: OtlpValue };
type OtlpLogRecord = {
  timeUnixNano?: string;
  observedTimeUnixNano?: string;
  body?: OtlpValue;
  attributes?: OtlpAttribute[];
};
export type OtlpLogsPayload = {
  resourceLogs?: {
    resource?: { attributes?: OtlpAttribute[] };
    scopeLogs?: { logRecords?: OtlpLogRecord[] }[];
  }[];
};

function attrMap(attrs: OtlpAttribute[] | undefined): Map<string, string | number | boolean> {
  const out = new Map<string, string | number | boolean>();
  for (const a of attrs ?? []) {
    const v = a.value ?? {};
    if (v.stringValue !== undefined) out.set(a.key, v.stringValue);
    else if (v.intValue !== undefined) out.set(a.key, Number(v.intValue));
    else if (v.doubleValue !== undefined) out.set(a.key, v.doubleValue);
    else if (v.boolValue !== undefined) out.set(a.key, v.boolValue);
  }
  return out;
}

function int(v: unknown): number | undefined {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : undefined;
}

/** Stable id so OTLP export retries never double count (FR-016). */
function eventIdFor(seed: string): string {
  const b = createHash("sha256").update(seed).digest();
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.subarray(0, 16).toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

export interface OtlpMappedEvent {
  /** Raw Claude session id (the connector normalizes it to a UUID). */
  sessionKey: string | undefined;
  event: ActivityEvent;
}

export function claudeOtlpLogsToEvents(
  payload: OtlpLogsPayload,
  ctx: ConnectorContext,
): OtlpMappedEvent[] {
  const out: OtlpMappedEvent[] = [];
  for (const rl of payload.resourceLogs ?? []) {
    const resource = attrMap(rl.resource?.attributes);
    for (const sl of rl.scopeLogs ?? []) {
      for (const rec of sl.logRecords ?? []) {
        const a = attrMap(rec.attributes);
        const name = String(a.get("event.name") ?? rec.body?.stringValue ?? "").replace(/^claude_code\./, "");
        if (name !== "api_request" && name !== "api_error") continue;

        const ts =
          typeof a.get("event.timestamp") === "string"
            ? new Date(String(a.get("event.timestamp")))
            : rec.timeUnixNano
              ? new Date(Number(BigInt(rec.timeUnixNano) / 1_000_000n))
              : new Date();
        if (Number.isNaN(ts.getTime())) continue;

        const sessionKey = String(a.get("session.id") ?? resource.get("session.id") ?? "") || undefined;
        const requestKey = String(
          a.get("request_id") ?? a.get("client_request_id") ?? `${sessionKey}:${a.get("event.sequence") ?? ts.getTime()}`,
        );
        const model = a.get("model");
        const failed = name === "api_error";

        const metadata: NonNullable<ActivityEvent["metadata"]> = {
          telemetry_source: "otel",
          provider_name: "claude_code",
        };
        if (typeof model === "string" && model) metadata.model_name = model.slice(0, 64);
        const input = int(a.get("input_tokens"));
        const output = int(a.get("output_tokens"));
        const cacheRead = int(a.get("cache_read_tokens"));
        const cacheCreate = int(a.get("cache_creation_tokens"));
        if (input !== undefined) metadata.token_input = input;
        if (output !== undefined) metadata.token_output = output;
        if (cacheRead !== undefined) metadata.cache_read_tokens = cacheRead;
        if (cacheCreate !== undefined) metadata.cache_creation_tokens = cacheCreate;

        out.push({
          sessionKey,
          event: {
            event_id: eventIdFor(`claude-otel:${ctx.deviceId}:${name}:${requestKey}`),
            schema_version: SCHEMA_VERSION,
            organization_id: ctx.organizationId,
            developer_id: ctx.developerId,
            device_id: ctx.deviceId,
            provider: "claude_code",
            connector_version: ctx.connectorVersion,
            event_type: EventTypes.model_request_completed,
            // Claude reports the completion time; duration_ms is the call itself.
            occurred_at: ts.toISOString(),
            duration_ms: int(a.get("duration_ms")),
            status: failed ? "failed" : "succeeded",
            consent_version: ctx.consentVersion,
            metadata,
          },
        });
      }
    }
  }
  return out;
}
