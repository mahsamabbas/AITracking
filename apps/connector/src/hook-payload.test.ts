import { describe, expect, it } from "vitest";
import { normalizeHookPayload } from "./hook-payload.js";

const NO_ENV = {};

describe("normalizeHookPayload", () => {
  it("maps Windsurf Cascade actions and keeps only the written file path", () => {
    const body = normalizeHookPayload(
      {
        agent_action_name: "post_write_code",
        trajectory_id: "traj-1",
        execution_id: "exec-1",
        model_name: "SWE-1.5",
        tool_info: {
          file_path: "/repo/src/app.ts",
          edits: [{ old_string: "secret old", new_string: "secret new" }],
        },
      },
      "windsurf",
      undefined,
      NO_ENV,
    );
    expect(body).toMatchObject({
      provider: "windsurf",
      hook_event_name: "PostToolUse",
      session_id: "traj-1",
      tool_name: "write_code",
      file_path: "/repo/src/app.ts",
      model: "SWE-1.5",
    });
    expect(JSON.stringify(body)).not.toContain("secret");
  });

  it("turns a Windsurf prompt and response into a turn without the text", () => {
    const start = normalizeHookPayload(
      { agent_action_name: "pre_user_prompt", trajectory_id: "t", tool_info: { user_prompt: "my private prompt" } },
      "windsurf",
      undefined,
      NO_ENV,
    );
    const end = normalizeHookPayload(
      { agent_action_name: "post_cascade_response", trajectory_id: "t", tool_info: { response: "private answer" } },
      "windsurf",
      undefined,
      NO_ENV,
    );
    expect(start?.hook_event_name).toBe("UserPromptSubmit");
    expect(end?.hook_event_name).toBe("Stop");
    expect(JSON.stringify([start, end])).not.toMatch(/private/);
  });

  it("pairs Windsurf pre/post command hooks and drops the command line", () => {
    const pre = normalizeHookPayload(
      { agent_action_name: "pre_run_command", execution_id: "e", tool_info: { command_line: "rm -rf secret", cwd: "/repo" } },
      "windsurf",
      undefined,
      NO_ENV,
    );
    const post = normalizeHookPayload(
      { agent_action_name: "post_run_command", execution_id: "e", tool_info: { command_line: "rm -rf secret", cwd: "/repo" } },
      "windsurf",
      undefined,
      NO_ENV,
    );
    expect(pre).toMatchObject({ hook_event_name: "PreToolUse", tool_name: "run_command", cwd: "/repo" });
    expect(post?.tool_use_id).toBe(pre?.tool_use_id);
    expect(JSON.stringify([pre, post])).not.toContain("secret");
  });

  it("reads GitHub Copilot CLI payloads (event from the installer, camelCase fields)", () => {
    const body = normalizeHookPayload(
      { sessionId: "s1", timestamp: 1, cwd: "/repo", toolName: "edit", toolArgs: { path: "/repo/a.ts", new_str: "code" } },
      "github_copilot",
      "PostToolUse",
      NO_ENV,
    );
    expect(body).toMatchObject({
      provider: "github_copilot",
      hook_event_name: "PostToolUse",
      session_id: "s1",
      tool_name: "edit",
      file_path: "/repo/a.ts",
    });
    expect(JSON.stringify(body)).not.toContain("code\"");
  });

  it("maps Gemini CLI model hooks to per-call invocations and skips agent turns", () => {
    const body = normalizeHookPayload(
      { session_id: "g", hook_event_name: "BeforeModel", llm_request: { model: "gemini-2.5-pro", messages: ["hi"] } },
      "gemini",
      undefined,
      NO_ENV,
    );
    expect(body).toMatchObject({ provider: "gemini", hook_event_name: "PreInvocation", model: "gemini-2.5-pro" });
    expect(normalizeHookPayload({ hook_event_name: "BeforeAgent" }, "gemini", undefined, NO_ENV)).toBeNull();
  });

  it("recognises Devin CLI running Claude-format hooks", () => {
    const body = normalizeHookPayload(
      { session_id: "d", prompt_id: "p1", hook_event_name: "PreToolUse", tool_name: "exec" },
      "claude_code",
      undefined,
      { CLAUDECODE: "1" },
    );
    expect(body?.provider).toBe("devin");
  });

  it("keeps Cursor and Claude Code detection from the environment", () => {
    const hook = { session_id: "x", hook_event_name: "Stop" };
    expect(normalizeHookPayload(hook, "claude_code", undefined, { CURSOR_AGENT: "1" })?.provider).toBe("cursor");
    expect(normalizeHookPayload(hook, "claude_code", undefined, { CLAUDECODE: "1" })?.provider).toBe("claude_code");
    expect(normalizeHookPayload(hook, "codex", undefined, { CLAUDECODE: "1" })?.provider).toBe("codex");
  });

  it("is self-contained, so its source runs verbatim as the standalone hook script", () => {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const standalone = new Function(`return (${normalizeHookPayload.toString()});`)() as typeof normalizeHookPayload;
    const payload = { agent_action_name: "post_write_code", trajectory_id: "t", tool_info: { file_path: "/r/x.ts" } };
    expect(standalone(payload, "windsurf", undefined, {})).toEqual(normalizeHookPayload(payload, "windsurf", undefined, {}));
  });
});
