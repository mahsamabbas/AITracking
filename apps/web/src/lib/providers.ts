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
  codex: { id: "codex", label: "Codex", color: "#0d9488", soft: "#f0fdfa", ink: "#115e59" },
  gemini: {
    id: "gemini",
    label: "Gemini CLI",
    shortLabel: "Gemini",
    color: "#0ea5e9",
    soft: "#f0f9ff",
    ink: "#075985",
  },
  github_copilot: {
    id: "github_copilot",
    label: "GitHub Copilot",
    shortLabel: "Copilot",
    color: "#64748b",
    soft: "#f8fafc",
    ink: "#334155",
    note: "Tier B: GitHub reports aggregate per day, so session-level metrics are unavailable.",
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

export function providerBadgeLabel(
  id: string | null | undefined,
  size: "sm" | "md" = "md",
): string {
  const meta = providerMeta(id);
  if (size === "sm" && meta.shortLabel) return meta.shortLabel;
  return meta.label;
}
