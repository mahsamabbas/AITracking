import { randomUUID } from "node:crypto";
import type { ActivityEvent } from "@techlio/event-schema";
import { EventTypes, SCHEMA_VERSION } from "@techlio/event-schema";
import { inferToolCategory } from "./tool-category.js";

export interface ConnectorContext {
  organizationId: string;
  developerId: string;
  deviceId: string;
  connectorVersion: string;
  consentVersion: string;
  provider: string;
}

/** Allowlisted fields only. Prompt text, tool input, and command text are ignored. */
export interface ClaudeHookPayload {
  hook_event_name?: string;
  session_id?: string;
  conversation_id?: string;
  tool_name?: string;
  tool?: string;
  cwd?: string;
  file_path?: string;
  model?: string;
  model_name?: string;
  status?: string;
  provider?: string;
  duration_ms?: number;
}

const hookToEvent: Record<string, ActivityEvent["event_type"]> = {
  SessionStart: EventTypes.session_started,
  sessionStart: EventTypes.session_started,
  SessionEnd: EventTypes.session_ended,
  sessionEnd: EventTypes.session_ended,
  PreToolUse: EventTypes.tool_started,
  preToolUse: EventTypes.tool_started,
  PostToolUse: EventTypes.tool_completed,
  postToolUse: EventTypes.tool_completed,
  PostToolUseFailure: EventTypes.tool_completed,
  postToolUseFailure: EventTypes.tool_completed,
  UserPromptSubmit: EventTypes.model_request_started,
  beforeSubmitPrompt: EventTypes.model_request_started,
  Stop: EventTypes.model_request_completed,
  stop: EventTypes.model_request_completed,
  afterFileEdit: EventTypes.file_modified,
  // Google Antigravity: one Pre/PostInvocation pair per model call, so the
  // measured duration is real per-call model timing (unlike prompt → stop).
  PreInvocation: EventTypes.model_request_started,
  PostInvocation: EventTypes.model_request_completed,
};

function workspaceName(cwd: string | undefined): string | undefined {
  if (!cwd) return undefined;
  const name = cwd.replace(/\\/g, "/").split("/").filter(Boolean).pop();
  return name?.slice(0, 64);
}

function safeFilePath(filePath: string | undefined, cwd: string | undefined): string | undefined {
  if (!filePath) return undefined;
  const normalized = filePath.replace(/\\/g, "/");
  const root = cwd?.replace(/\\/g, "/").replace(/\/$/, "");
  let relative = normalized;
  if (root && (normalized === root || normalized.startsWith(`${root}/`))) {
    relative = normalized.slice(root.length + 1);
  } else if (normalized.includes("/")) {
    relative = normalized.split("/").pop() ?? normalized;
  }
  return relative.slice(0, 512) || undefined;
}

export function claudeHookToEvents(
  payload: ClaudeHookPayload,
  ctx: ConnectorContext,
): ActivityEvent[] {
  // Antigravity's Stop ends an execution; its model calls are already counted
  // by Pre/PostInvocation, so Stop must not become a second model request.
  if (ctx.provider === "antigravity" && payload.hook_event_name === "Stop") return [];
  const type = payload.hook_event_name
    ? hookToEvent[payload.hook_event_name]
    : undefined;
  if (!type) return [];

  const occurredAt = new Date().toISOString();
  const sessionId = payload.session_id ?? payload.conversation_id;
  const toolName = (payload.tool_name ?? payload.tool ?? (type === "file_modified" ? "Edit" : ""))
    .slice(0, 128);
  const failed = (payload.hook_event_name ?? "").toLowerCase().includes("failure")
    || payload.status === "failed"
    || payload.status === "error"
    || payload.status === "aborted";
  const workspace = workspaceName(payload.cwd);
  const filePath = safeFilePath(payload.file_path, payload.cwd);
  const model = (payload.model ?? payload.model_name)?.slice(0, 64);
  const metadata: NonNullable<ActivityEvent["metadata"]> = {};
  if (toolName) {
    metadata.tool_name = toolName;
    metadata.tool_category = inferToolCategory(toolName);
  } else if (type === "file_modified") {
    metadata.tool_name = "Edit";
    metadata.tool_category = "file_write";
  }
  if (workspace) metadata.path_category = workspace;
  if (filePath) metadata.file_path = filePath;
  if (model) metadata.model_name = model;
  metadata.telemetry_source = "hook";

  const event: ActivityEvent = {
    event_id: randomUUID(),
    schema_version: SCHEMA_VERSION,
    organization_id: ctx.organizationId,
    developer_id: ctx.developerId,
    device_id: ctx.deviceId,
    provider: ctx.provider,
    connector_version: ctx.connectorVersion,
    session_id: sessionId,
    event_type: type,
    occurred_at: occurredAt,
    consent_version: ctx.consentVersion,
    status: failed ? "failed" : type.endsWith("_started") ? "started" : "succeeded",
    duration_ms:
      typeof payload.duration_ms === "number" && payload.duration_ms > 0
        ? Math.round(payload.duration_ms)
        : undefined,
    metadata: Object.keys(metadata).length ? metadata : undefined,
  };
  return [event];
}
