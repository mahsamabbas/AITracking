/** The allowlisted body a hook process sends to the connector's /hooks/agent. */
export interface HookBody {
  provider: string;
  hook_event_name?: string;
  session_id?: string;
  tool_name?: string;
  tool_use_id?: string;
  cwd?: string;
  file_path?: string;
  model?: string;
  status?: string;
}

/**
 * Turns one agent hook payload — from any supported AI tool — into the
 * allowlisted body the connector accepts. It runs inside the short-lived hook
 * process, so prompt text, tool arguments, diffs, command lines and responses
 * never leave it: only names, ids, timing-relevant events, the workspace
 * folder and the path of a file an agent wrote are kept.
 *
 *   argProvider  the tool whose config file registered this hook (the
 *                installer passes it), or "claude_code" for Claude-format hooks
 *   argEvent     the event name, for tools that do not put it on stdin
 *
 * Returns null for events that carry no activity (e.g. Gemini's per-turn
 * BeforeAgent/AfterAgent, which BeforeModel/AfterModel already cover).
 *
 * Deliberately self-contained — no imports, no inner helper functions — because
 * its source is also written out verbatim as the standalone report-hook.mjs.
 */
export function normalizeHookPayload(
  raw: Record<string, unknown> | null | undefined,
  argProvider: string | undefined,
  argEvent: string | undefined,
  env: Record<string, string | undefined>,
): HookBody | null {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const fallback = argProvider || "claude_code";

  // Which tool is this? Tools with their own hook file are named by the installer.
  let provider = fallback;
  if (!["antigravity", "windsurf", "github_copilot", "gemini", "codex"].includes(fallback)) {
    if (typeof r.prompt_id === "string") {
      // Devin CLI runs Claude-format hooks too; only it sends a per-turn prompt_id.
      provider = "devin";
    } else if (env.CURSOR_AGENT || env.CURSOR_CONVERSATION_ID || env.CURSOR_TRACE_ID || env.CURSOR_REQUEST_ID) {
      // Cursor also runs Claude-format hooks; real Claude Code never sets CURSOR_*.
      provider = "cursor";
    } else if (env.CLAUDECODE || env.CLAUDE_CODE_ENTRYPOINT) {
      provider = "claude_code";
    }
  }

  const roots = Array.isArray(r.workspace_roots) ? r.workspace_roots : Array.isArray(r.workspacePaths) ? r.workspacePaths : [];
  // Antigravity: only toolCall.name/id are read; toolCall.args never leave here.
  const toolCall = r.toolCall && typeof r.toolCall === "object" ? r.toolCall : {};
  const toolInput =
    r.tool_input && typeof r.tool_input === "object"
      ? r.tool_input
      : r.toolArgs && typeof r.toolArgs === "object"
        ? r.toolArgs
        : {};
  // Windsurf (Cascade) nests everything under tool_info.
  const toolInfo = r.tool_info && typeof r.tool_info === "object" ? r.tool_info : {};

  let event: string | undefined = r.hook_event_name || r.hookEventName || argEvent;
  let toolName: string | undefined = r.tool_name || r.toolName || r.tool || toolCall.name;
  let toolUseId: string | undefined = r.tool_use_id || r.toolUseId || toolCall.id;
  let writtenPath: string | undefined;

  if (provider === "windsurf") {
    const action = String(r.agent_action_name || argEvent || "");
    const kind = action.replace(/^(pre|post)_/, "");
    const isPre = action.startsWith("pre_");
    event = undefined;
    toolName = undefined;
    if (kind === "user_prompt") event = "UserPromptSubmit";
    else if (kind === "cascade_response") event = "Stop";
    else if (kind === "read_code" || kind === "write_code" || kind === "run_command" || kind === "mcp_tool_use") {
      event = isPre ? "PreToolUse" : "PostToolUse";
      toolName =
        kind === "mcp_tool_use"
          ? `mcp:${String(toolInfo.mcp_server_name || "server")}/${String(toolInfo.mcp_tool_name || "tool")}`
          : kind;
      // Pairs this action's pre and post hooks within the agent turn.
      toolUseId = `${String(r.execution_id || "")}:${kind}:${String(toolInfo.file_path || toolInfo.mcp_tool_name || "")}`;
      if (kind === "write_code" && !isPre && typeof toolInfo.file_path === "string") writtenPath = toolInfo.file_path;
    }
  } else if (toolName && /write|edit|replace|create|patch/i.test(String(toolName))) {
    // Only the path of a file an agent wrote — never its content or the diff.
    const p = toolInput.file_path ?? toolInput.notebook_path ?? toolInput.filePath ?? toolInput.path;
    if (typeof p === "string") writtenPath = p;
  }

  // Tool-specific event names → the connector's canonical ones.
  const aliases: Record<string, string | null> = {
    BeforeTool: "PreToolUse",
    AfterTool: "PostToolUse",
    BeforeModel: "PreInvocation",
    AfterModel: "PostInvocation",
    BeforeAgent: null,
    AfterAgent: null,
    userPromptSubmitted: "UserPromptSubmit",
    agentStop: "Stop",
    errorOccurred: null,
  };
  if (event && event in aliases) {
    const mapped = aliases[event];
    if (mapped === null) return null;
    event = mapped;
  }
  if (!event) return null;

  const cwd =
    typeof r.cwd === "string"
      ? r.cwd
      : typeof toolInfo.cwd === "string"
        ? toolInfo.cwd
        : typeof roots[0] === "string"
          ? roots[0]
          : undefined;
  const model =
    r.model || r.model_name || r.modelName || (r.llm_request && typeof r.llm_request === "object" ? r.llm_request.model : undefined);

  return {
    provider,
    hook_event_name: event,
    session_id:
      r.session_id || r.sessionId || r.conversation_id || r.conversationId || r.trajectory_id || r.generation_id ||
      env.CURSOR_CONVERSATION_ID || undefined,
    tool_name: typeof toolName === "string" ? toolName : undefined,
    tool_use_id: typeof toolUseId === "string" ? toolUseId : undefined,
    cwd,
    file_path: typeof r.file_path === "string" ? r.file_path : writtenPath,
    model: typeof model === "string" ? model : undefined,
    status: r.status ?? (typeof r.error === "string" && r.error ? "failed" : undefined),
  };
}
