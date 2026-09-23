# Provider capability matrix (FR-012)

Reviewed 2026-09-23 against the code and a live local run (`tests/e2e/scenarios/ai-progress.live.test.ts`).
The static catalog is `packages/event-schema/src/providers.ts` (`PROVIDER_CAPABILITIES`); at runtime the
dashboard prefers each connector's **live capability report** (heartbeat → `connector_health.capabilities`,
migration 012) and falls back to the catalog.

**Legend:** ✅ supported · ◐ partial · — not available · ⏳ planned

## Catalog areas (FR-013 – FR-015)

| Area | Claude Code | Cursor | Google Antigravity | GitHub Copilot | VS Code companion | Codex | Gemini CLI |
|------|-------------|--------|--------------------|----------------|-------------------|-------|------------|
| Tier | A | A | A | B (daily) | B (companion) | ⏳ | ⏳ |
| Session boundaries | ✅ `SessionStart/End` hooks | ✅ `sessionStart/End` hooks | ◐ first event opens; `conversationId` groups | — | ◐ task context only | ⏳ | ⏳ |
| Model calls — count | ✅ with OTel (`api_request`); ◐ hooks only = agent turns | ◐ agent turns (`beforeSubmitPrompt → stop`) | ✅ `Pre/PostInvocation` per call | ◐ daily chat turns | — | ⏳ | ⏳ |
| Model calls — per-call timing | ✅ with OTel `duration_ms`; — hooks only | — (turn spans tools) | ✅ measured Pre→Post | — | — | ⏳ | ⏳ |
| Model name | ✅ OTel `model`; ◐ hook payload when present | ◐ hook payload when present | ✅ `modelName` | — | — | ⏳ | ⏳ |
| Token totals | ✅ with OTel (`input_tokens`, `output_tokens`, cache); — hooks only | — | — (no exporter; antigravity-cli#366) | — | — | ⏳ | ⏳ |
| Tool calls + timing | ✅ `Pre/PostToolUse` (measured) | ✅ `pre/postToolUse` (measured) | ✅ `Pre/PostToolUse` (name only; args never read) | — | — | ⏳ | ⏳ |
| Engineering checks (FR-014) | ◐ inferred from tool names (`test`, `build`) | ◐ same | ◐ same | — | ✅ companion test/build tasks | ⏳ | ⏳ |
| File-change metadata (FR-015) | ✅ tool `file_path` (repo-relative) | ✅ `afterFileEdit` | ◐ tool category only | ◐ daily lines accepted | ✅ file save path | ⏳ | ⏳ |
| Daily request counts | — | ✅ Admin API `daily-usage-data` (worker) | — | ✅ users-1-day report (worker) | — | — | — |
| Hourly summaries | ✅ | ✅ | ✅ | — daily only | — | ⏳ | ⏳ |

`missing` in the catalog, shown in the UI as “Not available from provider”:

| Provider | Catalog `missing` | Live report changes it when… |
|----------|-------------------|------------------------------|
| claude_code | `token_totals`, `model_call_timing` | OTel `api_request` seen within 24h → `[]` |
| cursor | `token_totals`, `model_call_timing` | — |
| antigravity | `token_totals` | — |
| github_copilot | `session_boundaries`, `model_request`, `tool_calls`, `hourly_summary` | — |
| vscode | `model_request`, `tool_calls` | — |
| codex, gemini | everything | adapters not built; connector OTLP traces/metrics return 501 |

## Sources and mapping

| Provider | Source | Code | Stored as |
|----------|--------|------|-----------|
| Claude Code | Hooks in `~/.claude/settings.json` | `apps/connector/src/agent-hooks.ts`, `packages/provider-adapters/src/claude-hook.ts` | session / model_request_* (turn) / tool_* / file_modified, `telemetry_source: hook` |
| Claude Code | OpenTelemetry logs → `POST 127.0.0.1:9477/v1/logs` (http/json) | `packages/provider-adapters/src/otlp-claude.ts` | `model_request_completed` with `duration_ms`, tokens, `telemetry_source: otel`; hook turns for that session are dropped (no double count) |
| Cursor | Hooks in `~/.cursor/hooks.json` | same adapter | as Claude hooks; Cursor-vs-Claude echo suppressed in connector |
| Cursor | Admin API `POST /teams/daily-usage-data` | `packages/puller/src/cursor.ts`, `apps/worker` | `provider_daily_aggregate` (`billable_requests_count`, `chat_requests_count`, `agent_requests_count`, `completions_count`, lines) on a `provider_pull` device, attributed by email |
| Antigravity | Hooks in `~/.gemini/config/hooks.json` (entry `techlio-connector`; event name passed as argv) | `agent-hooks.ts`, `claude-hook.ts` | `Pre/PostInvocation` → model calls; `Pre/PostToolUse` → tools; `Stop` ignored |
| Copilot | users-1-day report | `packages/puller/src/copilot.ts` | `provider_daily_aggregate`, attributed via `employee_provider_identities` (GitHub login) |
| VS Code / Cursor companion | VSIX extension | `apps/extension` | file saves, task context, engineering tasks |

## Sample events (as stored in `activity_events.payload`)

```jsonc
// Claude Code, OTel api_request
{ "event_type": "model_request_completed", "provider": "claude_code", "duration_ms": 2400, "status": "succeeded",
  "metadata": { "model_name": "claude-opus-5", "token_input": 1500, "token_output": 320, "telemetry_source": "otel" } }

// Cursor agent turn (hooks) — duration spans the whole turn, no tokens
{ "event_type": "model_request_completed", "provider": "cursor", "duration_ms": 41000,
  "metadata": { "path_category": "TechlioTrackingApp", "telemetry_source": "hook" } }

// Antigravity model call (measured PreInvocation → PostInvocation)
{ "event_type": "model_request_completed", "provider": "antigravity", "duration_ms": 1458,
  "metadata": { "model_name": "gemini-3.6-flash", "telemetry_source": "hook" } }

// Cursor Admin API, one person-day
{ "event_type": "provider_daily_aggregate", "provider": "cursor",
  "metadata": { "tier": "B", "daily_only": true, "aggregate_kind": "daily_usage", "aggregate_day": "2026-09-22",
                "billable_requests_count": 9, "chat_requests_count": 7, "agent_requests_count": 5, "completions_count": 30 } }
```

## Privacy guarantees per source

- Hooks: prompt text, tool input/args, and command text are never forwarded (runner reads named fields only).
  Antigravity `toolCall.args` is never read — verified with a `cat ~/.ssh/id_rsa` argument: 0 stored rows contain it.
- OTel: only `api_request` / `api_error` are mapped. `user_prompt`, `assistant_response`, `api_response_body`,
  `tool_result` are dropped even if a user enables `OTEL_LOG_USER_PROMPTS`. The connector also sets
  `OTEL_LOG_USER_PROMPTS=0`, `OTEL_LOG_ASSISTANT_RESPONSES=0`, `OTEL_LOG_TOOL_DETAILS=0`, and never overrides an
  existing organisation OTel endpoint.
- Tier B: account emails are used for attribution and never stored on events.

## Verification checklist

- [x] Claude Code hooks + OTel live on a real machine (this repo's own sessions, 2026-09-23)
- [x] Cursor hooks live
- [x] Antigravity hook runner path (argv event name, camelCase payload, args dropped) — simulated; no Antigravity install on the test machine
- [x] Cursor Admin API row → attribution → daily aggregate (`tier-b.live.test.ts`, synthetic row, cleaned up)
- [ ] Cursor Admin API against a real Enterprise key
- [ ] Copilot report against a real org with `View Organization Copilot Metrics`
- [ ] Antigravity on a machine with Antigravity installed
