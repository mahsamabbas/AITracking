# System patterns

1. **Allowlist metadata** at the connector; schema is strict in
   `@techlio/event-schema`. New keys require a schema change, never a passthrough.
2. **Idempotent ingest** via `event_id` + `ON CONFLICT DO NOTHING`.
3. **One place computes session metrics** — `computeSessionMetrics` in
   `packages/server-core/src/sessions.ts`. Results are persisted as columns on
   `agent_sessions`; nothing recomputes them in a controller or in the browser.
4. **Five durations never merge in the UI.** Model, tool, merged active,
   interactive span, elapsed span each keep their own label.
5. **Hour assignment by `occurred_at`**; late events create a new snapshot
   `version` rather than overwriting.
6. **Coverage gaps are explicit and never inferred as inactivity.** A paused,
   stale, or offline connector gets its own state, its own copy, and its own
   empty-state variant — distinct from "no activity observed".
7. **Unavailable ≠ zero.** A metric a provider does not report renders as
   "Not available from provider".
8. **Classification describes telemetry, not people.** No hidden score;
   `idle_dominant` always ships with its caveat. The single ranking is the
   `/leaderboard` table (admins + managers only, owner decision 2026-09-23):
   observed AI usage, "Not reported" ranked last, never labelled performance.
9. **RBAC on every route**, plus an org filter in every query; audit log on
   sensitive writes. Developers resolve only to their own `developerId`.
10. **Schema is owned by `infra/sql/`** and applied with `pnpm db:migrate`. The
    runtime never creates tables on boot.
11. **Shared display vocabulary** lives in `apps/web/src/lib/vocab.ts` so one
    concept never gets two labels on two screens.
12. **Only agent activity counts as work.** Heartbeats and connector/coverage
    events never extend a session, an hourly span, or a Workday period; a
    stopped/paused/offline connector is a coverage gap, never idle.
13. **One connector per OS user.** Anything that talks to the connector reads the
    per-user port (`~/.techlio-connector/port`); the dashboard never uses a
    connector paired to someone else.
14. **Ingest trusts the device, not the payload.** A device may only report its
    own developer; Tier B only from `provider_pull` devices; events are validated
    one by one.

