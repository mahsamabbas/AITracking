/** Provider ids used on events (FR-006 / FR-012). */
export const Providers = {
  claude_code: "claude_code",
  codex: "codex",
  gemini: "gemini",
  cursor: "cursor",
  github_copilot: "github_copilot",
  vscode: "vscode",
  antigravity: "antigravity",
  windsurf: "windsurf",
  devin: "devin",
} as const;

/** Every provider id the API accepts on registration, heartbeats, and events. */
export const KNOWN_PROVIDERS = Object.values(Providers) as string[];

export function isKnownProvider(id: string | null | undefined): id is ProviderId {
  return Boolean(id) && KNOWN_PROVIDERS.includes(id as string);
}

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
    // Hooks carry no token counts and no per-call model timing. While Claude
    // Code OpenTelemetry logs reach the connector (/v1/logs), its capability
    // report drops both from "missing".
    missing: ["token_totals", "model_call_timing"],
    emptyState:
      "Claude Code hooks do not report token totals. They are unavailable, not zero.",
    note:
      "Observed through Claude Code hooks: sessions, agent turns (prompt → stop), tool calls, and file edits. Model duration is the whole agent turn, including tool time.",
  },
  codex: {
    id: "codex",
    label: "Codex CLI",
    tier: "A",
    hourly: true,
    // Codex hooks bracket each turn and tool call; no token totals on stdin.
    missing: ["token_totals", "model_call_timing"],
    emptyState: "Codex hooks do not report token totals. They are unavailable, not zero.",
    note:
      "Observed through Codex CLI hooks (~/.codex/hooks.json): sessions, agent turns (prompt → stop), and tool calls. Codex asks you to trust a new hook once with /hooks before it runs.",
  },
  gemini: {
    id: "gemini",
    label: "Gemini CLI",
    tier: "A",
    hourly: true,
    // BeforeModel / AfterModel wrap every model call, so per-call timing is real.
    missing: ["token_totals"],
    emptyState: "Gemini CLI hooks do not report token totals. They are unavailable, not zero.",
    note:
      "Observed through Gemini CLI hooks (~/.gemini/settings.json): sessions, model calls with per-call timing, tool calls, and model names.",
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
    tier: "A",
    hourly: true,
    missing: ["token_totals", "model_call_timing"],
    emptyState:
      "Copilot agent hooks do not report token totals. Inline completions are not agent activity and are not observed.",
    note:
      "Observed through GitHub Copilot agent hooks (~/.copilot/hooks), used by Copilot CLI and VS Code agent mode: sessions, agent turns, and tool calls. Organisation daily reports add request counts when a GitHub token is configured.",
  },
  antigravity: {
    id: "antigravity",
    label: "Google Antigravity",
    tier: "A",
    hourly: true,
    // Hooks fire around every model invocation and tool call (real per-call
    // timing), but carry no token counts; Antigravity has no OTel exporter.
    missing: ["token_totals"],
    emptyState:
      "Antigravity hooks do not report token totals. They are unavailable, not zero.",
    note:
      "Observed through Antigravity hooks (~/.gemini/config/hooks.json): model invocations with per-call timing, tool calls, and model names. No token totals.",
  },
  windsurf: {
    id: "windsurf",
    label: "Windsurf",
    tier: "A",
    hourly: true,
    // Cascade hooks wrap each tool action; the turn runs from prompt to response.
    missing: ["token_totals", "model_call_timing"],
    emptyState: "Windsurf Cascade hooks do not report token totals. They are unavailable, not zero.",
    note:
      "Observed through Windsurf (Devin Desktop) Cascade hooks (~/.codeium/windsurf/hooks.json): agent turns (prompt → response), file reads and writes, commands, MCP tool calls, and model names.",
  },
  devin: {
    id: "devin",
    label: "Devin CLI",
    tier: "A",
    hourly: true,
    missing: ["token_totals", "model_call_timing"],
    emptyState: "Devin CLI hooks do not report token totals. They are unavailable, not zero.",
    note:
      "Observed through Devin CLI lifecycle hooks: sessions, agent turns, and tool calls. Devin cloud sessions run on Devin's own machines and are not observed by the connector.",
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
  if (n.includes("windsurf") || n.includes("devin")) return "windsurf";
  if (n.includes("antigravity")) return "antigravity";
  if (n.includes("claude")) return "claude_code";
  // VS Code and other VS Code–based editors report as the VS Code companion.
  return "vscode";
}
