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
    label: "Verify & ship",
    tone: "ok",
    productive: true,
    help: "Tests, builds, lint, type-checks, local CI, or a commit the connector saw in a repo the agent was working in. Counts and check state only — never the message, author, or code.",
  },
  assisted_editing: {
    label: "Writing code",
    tone: "info",
    productive: true,
    help: "The agent changed files in this session; no test or build events were observed.",
  },
  exploration: {
    label: "Research & planning",
    tone: "neutral",
    productive: true,
    help: "The agent used the model or tools without changing files — reads, search, questions, planning.",
  },
  idle_dominant: {
    label: "Long quiet gaps",
    tone: "warn",
    productive: false,
    help: "Most of the session span had little or no agent telemetry. This describes the signal, not the person.",
  },
};

export const LONG_QUIET_GAPS = {
  label: "Long quiet gaps",
  kpiHelp:
    "Gaps over 10 minutes inside sessions with little agent telemetry. The person may still have been working without the agent.",
  trendSubtitle: "Agent active time and long quiet gaps in sessions, per day",
  durationBandHelp:
    "Gaps over 10 minutes inside the session span, excluded from the interactive span.",
  listTitle: "Long quiet gaps & coverage",
  listSubtitle: "Gaps over 10 minutes, capped at 4 hours",
  emptyBody: "Agent activity in this period had no break longer than the 10-minute threshold.",
} as const;

export const REVIEWING_NO_AI = {
  label: "Reviewing (no AI running)",
  help: "Inside the interactive span with no model or tool operation running — reading, typing, reviewing.",
} as const;

export const OBSERVED_TIME_SPLIT = {
  title: "Where the time went",
  subtitle:
    "Verify & ship, writing code, research & planning, and idle — the same split as Work mix, kept as separate labels",
} as const;

export const AGENT_ACTIVITY_COUNTS = {
  title: "Agent activity counts",
  subtitle: "Aggregate counts for the range — per-person breakdown is on Employees",
} as const;

export const TREND_CHART = {
  idleSeries: "Long quiet gaps",
  idleTooltip: "Long quiet gaps in session",
} as const;

/** Workday chart legend and stat labels (hourly AI day view). */
export const WORKDAY_SERIES = [
  {
    key: "workingMs" as const,
    label: "Working with AI",
    color: "var(--chart-6)",
    dash: "4 3" as const,
    hint: "Time between agent events with no gap over 10 min",
  },
  {
    key: "activeMs" as const,
    label: "AI active",
    color: "var(--chart-1)",
    hint: "Model or tool running (merged)",
  },
  {
    key: "idleMs" as const,
    label: "Quiet gaps",
    color: "var(--chart-idle)",
    hint: "Working span with no agent running — reviewing, typing, waiting",
  },
  {
    key: "explorationMs" as const,
    label: "Research & planning",
    color: "var(--chart-3)",
    hint: "Agent active without file writes or verify/build tools — model time, reads, search, planning",
  },
  {
    key: "editingMs" as const,
    label: "Writing & verify",
    color: "var(--chart-2)",
    hint: "Agent active on file writes, tests, builds, lint, or typecheck",
  },
];

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
  commit: { label: "Commits", color: "var(--chart-4)" },
  connector: { label: "Connector health", color: "var(--chart-idle)" },
};

export const ACTIVITY_TYPE_ORDER = [
  "model",
  "tool",
  "engineering_check",
  "file_change",
  "session",
  "coverage",
  "commit",
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

const EVENT_LABELS: Record<string, string> = {
  commit_created: "Commit",
  commit_pushed: "Shipped (pushed)",
};

export function eventLabel(type: string): string {
  if (EVENT_LABELS[type]) return EVENT_LABELS[type];
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


/** Agent time by what it was doing — event time, same rules as the Workday graph. */
export interface WorkMix {
  verifyMs: number;
  writingMs: number;
  researchMs: number;
  idleMs: number;
  activeMs: number;
  workingMs: number;
}

export const WORK_MIX = {
  title: "Work mix",
  subtitle:
    "How working time split across verify & ship, writing code, research & planning, and idle — the same events as the Workday graph",
} as const;

export function workMixSlices(mix?: WorkMix | null): { name: string; value: number; formatted: string; color: string }[] {
  const m = mix ?? { verifyMs: 0, writingMs: 0, researchMs: 0, idleMs: 0, activeMs: 0, workingMs: 0 };
  const fmt = (ms: number) => {
    const min = Math.round(ms / 60_000);
    return min >= 60 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${min}m`;
  };
  return [
    { name: "Verify & ship", value: m.verifyMs, formatted: fmt(m.verifyMs), color: "var(--chart-3)" },
    { name: "Writing code", value: m.writingMs, formatted: fmt(m.writingMs), color: "var(--chart-1)" },
    { name: "Research & planning", value: m.researchMs, formatted: fmt(m.researchMs), color: "var(--chart-6)" },
    { name: "Idle", value: m.idleMs, formatted: fmt(m.idleMs), color: "var(--chart-idle)" },
  ];
}

export const WORK_MIX_HELP: Record<string, string> = {
  "Verify & ship": "Agent time running tests, builds, lint, type-checks, or the repo's CI gate.",
  "Writing code": "Agent time editing or creating files.",
  "Research & planning": "Agent time reading, searching, and in model calls without writing files.",
  Idle: "Inside a working period with no agent running — reviewing, typing, or waiting. Gaps over 10 minutes end the period.",
};
