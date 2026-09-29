export interface ProviderMeta {
  id: string;
  label: string;
  /** Shorter label for tight table cells and `sm` badges */
  shortLabel?: string;
  color: string;
  soft: string;
  ink: string;
  note?: string;
}

const META: Record<string, ProviderMeta> = {
  cursor: {
    id: "cursor",
    label: "Cursor",
    color: "#4f46e5",
    soft: "#eef2ff",
    ink: "#3730a3",
    note: "Observed through Cursor agent hooks: agent turns, tool calls, file edits. No token totals.",
  },
  claude_code: {
    id: "claude_code",
    label: "Claude Code",
    color: "#d97706",
    soft: "#fffbeb",
    ink: "#92400e",
    note: "Observed through Claude Code hooks: agent turns, tool calls, file edits. Token totals need OpenTelemetry, not yet ingested.",
  },
  codex: {
    id: "codex",
    label: "Codex CLI",
    shortLabel: "Codex",
    color: "#0d9488",
    soft: "#f0fdfa",
    ink: "#115e59",
    note: "Observed through Codex CLI hooks: sessions, agent turns, tool calls. Trust the hook once with /hooks in Codex. No token totals.",
  },
  gemini: {
    id: "gemini",
    label: "Gemini CLI",
    shortLabel: "Gemini",
    color: "#0ea5e9",
    soft: "#f0f9ff",
    ink: "#075985",
    note: "Observed through Gemini CLI hooks: sessions, model calls with per-call timing, tool calls. No token totals.",
  },
  github_copilot: {
    id: "github_copilot",
    label: "GitHub Copilot",
    shortLabel: "Copilot",
    color: "#64748b",
    soft: "#f8fafc",
    ink: "#334155",
    note: "Observed through Copilot agent hooks (Copilot CLI and VS Code agent mode): sessions, agent turns, tool calls. Inline completions are not agent activity.",
  },
  antigravity: {
    id: "antigravity",
    label: "Google Antigravity",
    color: "#16a34a",
    soft: "#f0fdf4",
    ink: "#166534",
    note: "Observed through Antigravity hooks: model invocations with per-call timing, tool calls. No token totals.",
  },
  windsurf: {
    id: "windsurf",
    label: "Windsurf",
    color: "#0891b2",
    soft: "#ecfeff",
    ink: "#155e75",
    note: "Observed through Windsurf (Devin Desktop) Cascade hooks: agent turns, file reads and writes, commands, MCP tools. No token totals.",
  },
  devin: {
    id: "devin",
    label: "Devin CLI",
    shortLabel: "Devin",
    color: "#334155",
    soft: "#f1f5f9",
    ink: "#1e293b",
    note: "Observed through Devin CLI hooks: sessions, agent turns, tool calls. Devin cloud sessions run on Devin's machines and are not observed.",
  },
  vscode: {
    id: "vscode",
    label: "VS Code companion",
    shortLabel: "VS Code",
    color: "#7c3aed",
    soft: "#f5f3ff",
    ink: "#5b21b6",
    note: "Companion extension: file and task-context signals only.",
  },
};

/**
 * AI tools an administrator can issue a connector key for, most common first.
 * The connector observes every supported tool on the computer either way; the
 * key's tool is the label its reports carry until another tool is seen.
 */
export const ASSIGNABLE_AI_TOOLS = [
  "claude_code",
  "cursor",
  "github_copilot",
  "windsurf",
  "antigravity",
  "gemini",
  "codex",
  "devin",
  "vscode",
] as const;

const FALLBACK: ProviderMeta = {
  id: "unknown",
  label: "Unknown tool",
  color: "#94a3b8",
  soft: "#f1f5f9",
  ink: "#475569",
};

export function providerMeta(id: string | null | undefined): ProviderMeta {
  if (!id) return FALLBACK;
  return META[id] ?? { ...FALLBACK, id, label: id };
}

export function providerLabel(id: string | null | undefined): string {
  return providerMeta(id).label;
}
