# Decision log

Newest last. Each entry: date · decision · why · consequence for developers.

| Date | Decision | Why | Consequence |
|------|----------|-----|-------------|
| 2026-09-03 | Not a timesheet / billing / performance tool (PRD v0.2) | Legal + trust | `POST /v1/events/timesheet` stays 404; no hidden scores |
| 2026-09-21 | Schema owned by `infra/sql`, runtime never creates tables | Reproducible deploys | New columns need a migration + `EXPECTED_SCHEMA_MIGRATION` bump |
| 2026-09-23 | Visible AI usage leaderboard for admins/managers only (owner) | Owner request | Must be covered by the approved monitoring notice |
| 2026-09-23 | ADR 001: connector-first, OTLP where available | Per-call truth | Tier B reports are supplementary |
| 2026-09-24 | Multi-tenant shared schema with a `platform` org for super admins | Serve several customers | Every query scoped by `organization_id`; super admin enters workspaces via header |
| 2026-09-24 | Only agent-reported file/test/build events count (013) | IDE saves are human work | Companion signals never count as AI work |
| 2026-09-24 | One time source: event-time engine for every time metric | Pages disagreed | Use `withEventTime`; never session columns for displayed time |
| 2026-09-25 | Production DB moved Neon → Supabase; `TECHLIO_DATABASE_URL` wins | Neon quota suspension; integration overrode `DATABASE_URL` | Keep `TECHLIO_DATABASE_URL` set in Vercel |
| 2026-09-29 | Hosting moved to Vercel team `techlio1`, domains `techlio-pulse*`; never mahsam's Vercel | Ownership | Only tracking-app projects public |
| 2026-09-29 | Retention: 14-day raw window, summarise → archive → purge, never purge without archive | DB growth (Free plan 500 MB) | New raw tables need a retention rule |
| 2026-09-29 | Serverless without Redis (`SKIP_REDIS=1`), recalculation inline and awaited | Vercel functions drop unawaited work | Keep request-time work bounded; worker optional |
| 2026-09-29 | Remote pause wins; local pause never lifted by the dashboard (017) | Heartbeat used to undo dashboard pauses | `paused = GREATEST(local, remote)` |
| 2026-09-29 | Polling (30 s, visible tab, range includes today), no WebSockets | Serverless + simplicity | SSE/WebSocket is a backlog item |
| 2026-09-29 | Install UI follows this computer; heartbeat only unlocks the dashboard | Uninstalled user saw no install tab | `installedHere` separate from `phase` |
| 2026-09-30 | Display preferences are per browser (`localStorage`), not in the DB | UI-only, no new data | Appearance settings don't sync across devices |
| 2026-09-30 | New AI tools integrated only through documented, stable user-level hooks | Truthful tracking | Windsurf, Copilot, Gemini CLI, Codex CLI, Devin CLI in; Cline/Kiro/Amazon Q deferred |
| 2026-09-30 | Devin CLI identified via `prompt_id` on Claude-format hooks, no separate Devin config | Devin reads `~/.claude` hooks by default; a second hook would double-count | If a user disables `read_config_from.claude`, Devin CLI is not tracked |
| 2026-09-30 | Linux connector shipped as `.tar.gz` + checksum-verifying install script, per-user (no sudo) | Raw binaries ~95 MB (git limit 100 MB); least-privilege install | systemd user service, XDG autostart fallback |
