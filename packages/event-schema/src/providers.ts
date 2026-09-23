/** Provider ids used on events (FR-006 / FR-012). */
export const Providers = {
  claude_code: "claude_code",
  codex: "codex",
  gemini: "gemini",
  cursor: "cursor",
  github_copilot: "github_copilot",
  vscode: "vscode",
} as const;

export type ProviderId = (typeof Providers)[keyof typeof Providers];

export type ProviderTier = "A" | "B";

export interface ProviderCapability {
  id: ProviderId;
  label: string;
  tier: ProviderTier;
  hourly: boolean;
  /** Event catalog areas this provider cannot supply (FR-012). */
  missing: string[];
  emptyState: string;
  /** Extra context shown next to the tool in the dashboard. */
  note?: string;
}

export const PROVIDER_CAPABILITIES: Record<string, ProviderCapability> = {
  claude_code: {
    id: "claude_code",
    label: "Claude Code",
    tier: "A",
    hourly: true,
    // Hooks carry no token counts and no per-call model timing. Token totals
    // need Claude Code OpenTelemetry, which this connector build does not
    // ingest (its OTLP routes return 501).
    missing: ["token_totals", "model_call_timing"],
    emptyState:
      "Claude Code hooks do not report token totals. They are unavailable, not zero.",
    note:
      "Observed through Claude Code hooks: sessions, agent turns (prompt → stop), tool calls, and file edits. Model duration is the whole agent turn, including tool time.",
  },
  codex: {
    id: "codex",
    label: "Codex",
    tier: "A",
    hourly: false,
    missing: ["session_boundaries", "model_request", "tool_calls", "token_totals", "hourly_summary"],
    emptyState: "Codex telemetry is not connected in this release.",
    note: "Planned Tier A adapter; the connector currently rejects OTLP rather than discarding it.",
  },
  gemini: {
    id: "gemini",
    label: "Gemini CLI",
    tier: "A",
    hourly: false,
    missing: ["session_boundaries", "model_request", "tool_calls", "token_totals", "hourly_summary"],
    emptyState: "Gemini telemetry is not connected in this release.",
    note: "Planned Tier A adapter; no Gemini event adapter is enabled.",
  },
  cursor: {
    id: "cursor",
    label: "Cursor",
    tier: "A",
    hourly: true,
    missing: ["token_totals", "model_call_timing"],
    emptyState:
      "Cursor hooks report prompt, tool, and file activity with timing. Token totals are not exposed by Cursor.",
    note:
      "Observed through Cursor agent hooks: agent turns (prompt → stop), tool calls, and file edits. Model duration is the whole agent turn. Daily request counts come from the Cursor Admin API only when an organisation key is configured.",
  },
  github_copilot: {
    id: "github_copilot",
    label: "GitHub Copilot",
    tier: "B",
    hourly: false,
    missing: [
      "session_boundaries",
      "model_request",
      "tool_calls",
      "hourly_summary",
    ],
    emptyState:
      "Provider does not expose this metric. Copilot organization reports are daily-only.",
    note: "Tier B: GitHub reports aggregate per day, so hourly and session metrics are unavailable.",
  },
  vscode: {
    id: "vscode",
    label: "VS Code companion",
    tier: "B",
    hourly: false,
    missing: ["model_request", "tool_calls"],
    emptyState:
      "VS Code companion records file and task metadata only — not model sessions.",
    note: "Companion extension: file and task-context signals only.",
  },
};

export function providerLabel(id: string | undefined): string {
  if (!id) return "Unknown";
  return PROVIDER_CAPABILITIES[id]?.label ?? id;
}

export function providerCapability(id: string | undefined): ProviderCapability | undefined {
  if (!id) return undefined;
  return PROVIDER_CAPABILITIES[id];
}

/** Map a host IDE name (e.g. vscode.env.appName) to a provider id. */
export function providerFromHostApp(appName: string | undefined): ProviderId {
  const n = (appName ?? "").toLowerCase();
  if (n.includes("cursor")) return "cursor";
  if (n.includes("visual studio code") || n === "vscode") return "vscode";
  if (n.includes("claude")) return "claude_code";
  return "cursor";
}
