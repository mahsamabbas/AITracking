# AI tool integrations

On every start the connector registers its hook for each supported tool present on the
computer (`ensureAgentHooks` in `apps/connector/src/agent-hooks.ts`). Every hook runs
`<connector> --hook <provider> [event]` (packaged) or `node ~/.techlio/connector/report-hook.mjs
<provider> [event]` (dev). Payloads are normalised in the hook process by
`normalizeHookPayload` (`hook-payload.ts`) → `/hooks/agent` → `claudeHookToEvents`
(`packages/provider-adapters`) → events. Researched against vendor docs on 2026-09-30.

| Tool | Hook file (user level) | Installed when | Events used | Notes / limits |
|------|------------------------|----------------|-------------|----------------|
| Claude Code | `~/.claude/settings.json` `hooks` | always | SessionStart/End, UserPromptSubmit, Pre/PostToolUse(+Failure), Stop | + OTLP logs → `/v1/logs` for token totals & per-call timing (prompts forced off). OTel turns replace hook turns |
| Cursor | `~/.cursor/hooks.json` | always | sessionStart/End, beforeSubmitPrompt, pre/postToolUse(+Failure), afterFileEdit, stop | Cursor also fires Claude-format hooks → cross-provider echo suppression; env `CURSOR_*` identifies it |
| Google Antigravity | `~/.gemini/config/hooks.json` entry `techlio-connector` | `~/.gemini` exists | Pre/PostToolUse, Pre/PostInvocation, Stop (event passed as arg) | per-call model timing; no tokens |
| **Windsurf / Devin Desktop** | `~/.codeium/windsurf/hooks.json` | `~/.codeium/windsurf` exists | pre_user_prompt → turn start, post_cascade_response → turn end, pre/post read_code, write_code, run_command, mcp_tool_use | `trajectory_id` = session, `execution_id` pairs pre/post, `model_name`; written file path only (edits/commands/prompt never read). `command` + `powershell` keys |
| **GitHub Copilot** | `~/.copilot/hooks/techlio-connector.json` (own file) | always | SessionStart/End, UserPromptSubmit, Pre/PostToolUse(+Failure), Stop — PascalCase, event passed as arg | read by Copilot CLI and VS Code agent mode (`chat.useHooks`, on by default). Handles camelCase `sessionId/toolName/toolArgs` and snake_case payloads. Inline completions are not agent activity. Org daily reports stay Tier B (worker) |
| **Gemini CLI** | `~/.gemini/settings.json` `hooks` | `settings.json` exists or `gemini` on PATH | SessionStart/End, BeforeModel/AfterModel → per-call model events, BeforeTool/AfterTool; BeforeAgent/AfterAgent ignored | model from `llm_request.model` |
| **Codex CLI** | `~/.codex/hooks.json` | `~/.codex` exists or `codex` on PATH | SessionStart/End, UserPromptSubmit, Pre/PostToolUse, Stop | **user must trust the hook once with `/hooks` in Codex** (Codex hash-pins hooks) |
| **Devin CLI** | none of its own — Devin CLI reads `~/.claude/settings.json` hooks (`read_config_from.claude`, default on) | via Claude hooks | Claude event names | identified by `prompt_id` in the payload (only Devin sends it). Devin **cloud** sessions (app.devin.ai) are not observable by a connector |
| VS Code companion | extension via `cursor`/`code`/`windsurf`/`antigravity` CLIs | editor CLI on PATH | host + task context | companion events never count as AI work |

## Adding another tool
1. Catalogue entry in `packages/event-schema/src/providers.ts` (+ web colours in
   `apps/web/src/lib/providers.ts`, add to `ASSIGNABLE_AI_TOOLS`).
2. Payload shape → `normalizeHookPayload` (keep it self-contained; add a test).
3. Installer + removal in `agent-hooks.ts` (merge, never overwrite; `isTechlioHook` regex).
4. Tests: `hook-payload.test.ts`, `agent-hooks.test.ts` (temp HOME, end-to-end script run).
5. Rebuild installers (`pnpm connector:pack`).

## Not integrated (checked 2026-09-30)
Cline (hooks directory format mid-migration), Kiro (v3 hooks migration), Amazon Q, Aider,
JetBrains AI — no stable user-level hook API confirmed; revisit.
