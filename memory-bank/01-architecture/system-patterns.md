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

15. **One time source.** Every displayed time goes through the event-time engine
    (`activityTimeline` / `withEventTime`). See [analytics-engine.md](analytics-engine.md).
16. **The provider catalogue is the single list of AI tools.**
    `packages/event-schema/src/providers.ts` drives key validation, the filter dropdowns
    (`/v1/meta/filters`), connector capability reports, and (via `ASSIGNABLE_AI_TOOLS` +
    colours in `apps/web/src/lib/providers.ts`) the key-issuing dropdown. Adding a tool = add it
    there first, then its hook installer in the connector.
17. **Hook payloads are normalised inside the hook process.** `normalizeHookPayload`
    (`apps/connector/src/hook-payload.ts`) keeps names, ids, workspace folder and the path of a
    written file only — never prompts, arguments, diffs, commands or responses. It is
    self-contained because its source is written verbatim as the standalone `report-hook.mjs`;
    a test enforces that.
18. **Never overwrite a user's tool config.** Hook installers read → merge → atomic write, replace
    only their own entries (`isTechlioHook`), skip unreadable files, and remove only their own
    entries on uninstall.
19. **Dashboard pause wins, local pause stays.** `paused = GREATEST(local, remote)`; the dashboard
    can never lift a pause the developer set.
20. **Install UI follows this computer.** A recent server heartbeat keeps the dashboard unlocked,
    but the Install agent tab/steps depend only on a local connector answer.
21. **Polling, not sockets, with limits.** `useApi` polls only while the tab is visible and the
    range includes today; one coalesced poller for the local connector; the *Live updates*
    preference can turn polling off.
22. **Shared helpers live in one place — import, don't re-declare.**
    - Connector: `paths.ts` (`dataDir()` = `~/.techlio-connector`, `installDir()` =
      `~/.techlio/connector`), `os-utils.ts` (`onPath`, `QUIET` spawn options, `uuidFromSeed`).
      Exception: the generated hook template in `agent-hooks.ts` must stay self-contained.
    - server-core: `time-utils.ts` (`HOUR_MS`, `hourStartUtc`), `sql-helpers.ts` (`toNumber`,
      `toNumberOrNull`, `teamMemberFilter`), work-mix owns `mergeIntervals`/`Interval`,
      sessions owns `LATE_EVENT_MS`.
    - API: `auth/access.ts` (`scopeDeveloperIds`, `assertCanViewPeople`, `assertInScope`,
      `assertCanViewDeveloper`); dev identities come from server-core (`DEV_ORG`, …).
    - Web: storage keys, accent ids and the pre-paint boot scripts come from
      `lib/preferences-boot.ts`; `ConnectorState`/`WorkMix` types from `lib/vocab`;
      `LivePerson` from `lib/types`; poll interval `LIVE_POLL_MS` from `lib/live-poll`.
