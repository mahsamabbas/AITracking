/** Display vocabulary mirroring @techlio/server-core's activity model. */

export type ConnectorState = "online" | "stale" | "paused" | "offline";

export const CONNECTOR_STATE: Record<
  ConnectorState,
  { label: string; tone: "ok" | "warn" | "bad" | "neutral"; help: string }
> = {
  online: {
    label: "Online",
    tone: "ok",
    help: "A real heartbeat from this device in the last 5 minutes.",
  },
  stale: {
    label: "Stale",
    tone: "warn",
    help: "No heartbeat for over 5 minutes — telemetry for this period may be incomplete.",
  },
  paused: {
    label: "Paused",
    tone: "warn",
    help: "Collection was paused. A coverage gap is recorded; this is not a conclusion about the person's work.",
  },
  offline: {
    label: "Offline",
    tone: "bad",
    help: "No heartbeat has ever been recorded for this connector.",
  },
};

export type Classification =
  | "engineering_output"
  | "assisted_editing"
  | "exploration"
  | "idle_dominant";

export const CLASSIFICATION: Record<
  Classification,
  { label: string; tone: "ok" | "info" | "neutral" | "warn"; help: string; productive: boolean }
> = {
  engineering_output: {
    label: "Engineering output",
    tone: "ok",
    productive: true,
    help: "Agent activity produced test, build, lint, or type-check outcomes.",
  },
  assisted_editing: {
    label: "Assisted editing",
    tone: "info",
    productive: true,
    help: "Agent activity produced file changes, without engineering checks.",
  },
  exploration: {
    label: "Exploration",
    tone: "neutral",
    productive: true,
    help: "Model and tool activity with no file changes — reads, searches, and questions.",
  },
  idle_dominant: {
    label: "Mostly idle",
    tone: "warn",
    productive: false,
    help: "Over half the session span had no observed agent activity. This describes the telemetry, not the person.",
  },
};

export function classificationOf(id: string) {
  return CLASSIFICATION[id as Classification] ?? CLASSIFICATION.exploration;
}

/** Stable colours for session-outcome donuts (org, employee, tool pages). */
export const CLASSIFICATION_CHART_COLOR: Record<Classification, string> = {
  engineering_output: "var(--chart-2)",
  assisted_editing: "var(--chart-1)",
  exploration: "var(--chart-6)",
  idle_dominant: "var(--chart-idle)",
};

export const CLASSIFICATION_ORDER: Classification[] = [
  "engineering_output",
  "assisted_editing",
  "exploration",
  "idle_dominant",
];

export interface ClassificationDonutSlice {
  name: string;
  value: number;
  formatted: string;
  color: string;
}

/** Every observed session pattern — includes zero counts so the legend stays complete. */
export function classificationDonutSlices(
  rows: { classification: string; sessions: number }[],
): ClassificationDonutSlice[] {
  const byId = new Map(rows.map((r) => [r.classification, r.sessions]));
  return CLASSIFICATION_ORDER.map((id) => {
    const info = CLASSIFICATION[id];
    const sessions = byId.get(id) ?? 0;
    return {
      name: info.label,
      value: sessions,
      formatted: String(sessions),
      color: CLASSIFICATION_CHART_COLOR[id],
    };
  });
}

export const ACTIVITY_TYPE: Record<string, { label: string; color: string }> = {
  model: { label: "Model calls", color: "var(--chart-1)" },
  tool: { label: "Tool use", color: "var(--chart-2)" },
  engineering_check: { label: "Tests & builds", color: "var(--chart-3)" },
  file_change: { label: "File changes", color: "var(--chart-5)" },
  session: { label: "Session lifecycle", color: "var(--chart-6)" },
  coverage: { label: "Coverage signals", color: "var(--chart-4)" },
  connector: { label: "Connector health", color: "var(--chart-idle)" },
};

export const ACTIVITY_TYPE_ORDER = [
  "model",
  "tool",
  "engineering_check",
  "file_change",
  "session",
  "coverage",
  "connector",
];

export const TOOL_CATEGORY_LABEL: Record<string, string> = {
  file_read: "File read",
  file_write: "File write",
  search: "Search",
  shell: "Shell",
  test: "Test",
  build: "Build",
  browser: "Browser",
  other: "Other",
};

export function eventLabel(type: string): string {
  return type.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

export const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-4)",
];
