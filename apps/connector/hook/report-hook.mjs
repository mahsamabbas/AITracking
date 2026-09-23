#!/usr/bin/env node
/**
 * Claude Code / Cursor hook. Forwards allowlisted fields only.
 * Prompt text, tool input, command text, and file contents are dropped here.
 *
 * The running app is identified by its own environment — not by which settings
 * file launched the hook — so Cursor actions are never mislabelled as Claude.
 */
const fallback = process.argv[2] || "claude_code";

function detectProvider() {
  // Only Antigravity reads ~/.gemini/config/hooks.json, so its explicit
  // argument is trusted even when launched from a Claude Code terminal.
  if (fallback === "antigravity") return "antigravity";
  // Cursor also runs Claude-format hooks, so a Cursor action can reach the
  // Claude settings entry. Cursor markers win first — real Claude Code never
  // sets them — so Cursor work is never mislabelled as Claude.
  if (
    process.env.CURSOR_AGENT ||
    process.env.CURSOR_CONVERSATION_ID ||
    process.env.CURSOR_TRACE_ID ||
    process.env.CURSOR_REQUEST_ID
  ) {
    return "cursor";
  }
  if (process.env.CLAUDECODE || process.env.CLAUDE_CODE_ENTRYPOINT) return "claude_code";
  return fallback;
}

const chunks = [];
process.stdin.on("data", (chunk) => chunks.push(chunk));
process.stdin.on("end", () => {
  let raw = {};
  try {
    raw = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    raw = {};
  }
  const roots = Array.isArray(raw.workspace_roots) ? raw.workspace_roots : Array.isArray(raw.workspacePaths) ? raw.workspacePaths : [];
  // Antigravity: only toolCall.name is read; toolCall.args (commands, file
  // content) never leaves this process.
  const toolCall = raw.toolCall && typeof raw.toolCall === "object" ? raw.toolCall : {};
  const cwd =
    typeof raw.cwd === "string"
      ? raw.cwd
      : typeof roots[0] === "string"
        ? roots[0]
        : undefined;
  const body = {
    provider: detectProvider(),
    // Antigravity does not name the event on stdin; the installer passes it as argv[3].
    hook_event_name: raw.hook_event_name || process.argv[3],
    session_id:
      raw.session_id ||
      raw.conversation_id ||
      raw.conversationId ||
      raw.generation_id ||
      process.env.CURSOR_CONVERSATION_ID,
    tool_name: raw.tool_name || raw.tool || toolCall.name,
    tool_use_id: raw.tool_use_id || raw.toolUseId || toolCall.id,
    cwd,
    file_path: typeof raw.file_path === "string" ? raw.file_path : undefined,
    model: raw.model || raw.model_name || raw.modelName,
    status: raw.status || (typeof raw.error === "string" && raw.error ? "failed" : undefined),
  };
  fetch("http://127.0.0.1:9477/hooks/agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
    .catch(() => undefined)
    .finally(() => {
      process.stdout.write("{}\n");
    });
});
