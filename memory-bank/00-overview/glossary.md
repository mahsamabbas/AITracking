# Glossary

Terms used in code, UI and this memory bank. One meaning each — if the UI uses a
different word for the same thing, `apps/web/src/lib/vocab.ts` is the source.

| Term | Meaning |
|------|---------|
| **Connector** | The per-user background program on a developer's computer (`apps/connector`). Collects agent activity and uploads signed batches. |
| **Device / connector key** | A device ID + one-time token an administrator issues on Access for one employee and one AI tool. The developer activates it on My connectors. |
| **Provider / AI tool** | The agent that produced an event: `claude_code`, `cursor`, `github_copilot`, `windsurf`, `antigravity`, `gemini`, `codex`, `devin`, `vscode` (catalogue: `packages/event-schema/src/providers.ts`). |
| **Tier A** | Per-event agent telemetry from the connector (hooks, OTLP, companion, git). Time-accurate. |
| **Tier B** | Provider daily aggregates pulled by the optional worker (Cursor Admin API, GitHub Copilot reports). Daily only; `provider_daily_aggregate` events from `provider_pull` devices. |
| **Hook** | A command an AI tool runs at lifecycle points (session start, prompt, tool pre/post, stop). The connector registers one per tool and receives allowlisted fields on `/hooks/agent`. |
| **Agent active time** | Union of merged agent work intervals per person. Not total working time. |
| **Quiet gap / idle** | ≥ 10 min (`IDLE_THRESHOLD_MS`) inside working time with no agent activity. Never "inactivity". |
| **Coverage gap / not collecting** | A period the system cannot see (paused, stopped, offline, stale). Unknown — never idle. |
| **Stale connector** | No heartbeat for 5 min (`STALE_MS`). |
| **Working with AI** | Active time plus quiet gaps inside sessions. |
| **Work mix** | Verify & ship (tests/builds/lint/typecheck), writing code (file edits), research & planning (reads, search, model calls), idle. |
| **Five durations** | Session model, tool, merged active, interactive span, elapsed span. Always shown separately, never summed. |
| **Event-time engine** | `activityTimeline()` in `server-core/src/work-mix.ts` — every time KPI/chart comes from it (`withEventTime`). |
| **Session classification** | `engineering_output`, `assisted_editing`, `exploration`, `idle_dominant` — describes telemetry, not people. |
| **Hourly snapshot** | Versioned deterministic card per developer × clock hour; late events create a new version. |
| **activity_hourly** | Retention rollup that replaces raw events older than 14 days. |
| **Verify & ship** | Commit → verified (a passing check ran first) → shipped (pushed). Counts only. |
| **Remote pause** | Pause set from the dashboard (`connector_health.remote_paused`); returned in the heartbeat reply; ingest drops that device's events. Never lifts a local pause. |
| **Platform / customer organisation** | Tenants. `platform` holds super admins only; `customer` holds monitored people. |
| **Display timezone** | The viewer's chosen zone (header `x-techlio-display-timezone`); reporting buckets use it or the org default. |
