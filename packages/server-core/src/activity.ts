import type { ActivityEvent } from "@techlio/event-schema";

/**
 * Activity vocabulary shared by sessionization, analytics, and the dashboard
 * filters. Categories describe *what the agent did*, never what a person is
 * worth (PRD §3 non-goals, SEC-009).
 */
export type ActivityType =
  | "model"
  | "tool"
  | "engineering_check"
  | "file_change"
  | "session"
  | "coverage"
  | "connector";

export const ACTIVITY_TYPES: ActivityType[] = [
  "model",
  "tool",
  "engineering_check",
  "file_change",
  "session",
  "coverage",
  "connector",
];

/**
 * True when an AI agent reported this file change or check — not an editor.
 * Agent hooks name the tool (Claude Code Write/Edit, Cursor afterFileEdit) or
 * mark their source; the IDE companion's save/typing events carry neither and
 * are a person's own edits, which must never count as AI file changes.
 */
export function isAgentReported(event: {
  metadata?: { tool_name?: unknown; telemetry_source?: unknown } | null;
}): boolean {
  const m = event.metadata ?? {};
  return (
    (typeof m.tool_name === "string" && m.tool_name.length > 0) ||
    m.telemetry_source === "hook" ||
    m.telemetry_source === "otel" ||
    m.telemetry_source === "provider_api"
  );
}

/** SQL twin of isAgentReported for an activity_events alias. */
export const AGENT_REPORTED_SQL = (alias: string) =>
  `(${alias}.payload->'metadata'->>'tool_name' IS NOT NULL OR ${alias}.payload->'metadata'->>'telemetry_source' IN ('hook','otel','provider_api'))`;

/** Editor (IDE companion) file saves and task runs: not agent activity. */
export function isEditorOnlyEvent(event: ActivityEvent): boolean {
  const type = activityTypeOf(event.event_type);
  return (type === "file_change" || type === "engineering_check") && !isAgentReported(event);
}

export function activityTypeOf(eventType: string): ActivityType {
  if (eventType.startsWith("model_")) return "model";
  if (eventType.startsWith("tool_")) return "tool";
  if (
    eventType.startsWith("test_") ||
    eventType.startsWith("build_") ||
    eventType.startsWith("lint_") ||
    eventType.startsWith("typecheck_")
  ) {
    return "engineering_check";
  }
  if (eventType.startsWith("file_")) return "file_change";
  if (eventType.startsWith("session_") || eventType === "task_context_changed") {
    return "session";
  }
  if (
    eventType.startsWith("telemetry_gap") ||
    eventType === "provider_capability_missing" ||
    eventType === "late_events_received" ||
    eventType === "unassigned_activity_detected" ||
    eventType === "connector_paused" ||
    eventType === "connector_resumed"
  ) {
    return "coverage";
  }
  return "connector";
}

/**
 * Evidence-based label for one session's observed activity.
 * `idle_dominant` means "little observed agent activity in this span" — it is
 * explicitly NOT a statement about the person's effort (SEC-009).
 */
export type SessionClassification =
  | "engineering_output"
  | "assisted_editing"
  | "exploration"
  | "idle_dominant";

export const PRODUCTIVE_CLASSIFICATIONS: SessionClassification[] = [
  "engineering_output",
  "assisted_editing",
  "exploration",
];

export const CLASSIFICATION_LABELS: Record<SessionClassification, string> = {
  engineering_output: "Engineering output",
  assisted_editing: "Assisted editing",
  exploration: "Exploration",
  idle_dominant: "Mostly idle",
};

export const CLASSIFICATION_DESCRIPTIONS: Record<SessionClassification, string> = {
  engineering_output:
    "Agent activity produced test, build, lint, or type-check outcomes.",
  assisted_editing: "Agent activity produced file changes, without checks.",
  exploration:
    "Model and tool activity with no file changes observed — reads, searches, questions.",
  idle_dominant:
    "More than half the session span had no observed agent activity. Not a conclusion about the person.",
};

/** The idle gap after which a session is considered no longer interactive (§11). */
export const IDLE_THRESHOLD_MS = 10 * 60 * 1000;

export function isProductive(c: string): boolean {
  return PRODUCTIVE_CLASSIFICATIONS.includes(c as SessionClassification);
}

export function toolCategoryOf(event: ActivityEvent): string {
  return event.metadata?.tool_category ?? "other";
}
