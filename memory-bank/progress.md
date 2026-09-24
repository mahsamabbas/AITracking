# Progress snapshot

**Overall:** the monitoring product works end-to-end on a local stack — data
model, analytics API, drill-down UI, role isolation, and realistic connected
data. **Not** production Definition of Done: legal approval, a real provider
pilot, production hardening, and the §19 live integration tests remain.

**Gap list:** [pending.md](pending.md)

## Delivered in the monitoring refactor

**Data**
- `employees` table; `agent_sessions` carries precomputed metrics (five
  durations, idle, counts, models, tool categories, classification, coverage).
- Real migration runner (`scripts/migrate.mjs` + `schema_migrations`); runtime no
  longer creates tables on boot.
- Deterministic 90-day seed for a 12-person org, including the awkward cases the
  product must handle.

**API**
- `/v1/analytics/organization`, `/v1/analytics/coverage`, `/v1/meta/filters`
- `/v1/employees`, `/v1/employees/:id`, `/v1/employees/:id/tools/:provider`,
  `/v1/employees/:id/sessions`, `/v1/sessions/:id`
- `/v1/dashboard/live` replaces the old `/v1/dashboard/team`: connector states,
  24h sessions, grouped coverage alerts, recent events.
- Every analytics endpoint is range-aware and returns period-over-period
  comparison figures.

**UI**
- Rebuilt design system: tokens in `globals.css`, `ui/` primitives, `charts/`,
  `domain/`, `filters/`, shared vocabulary in `lib/vocab.ts`.
- The six PRD empty states are distinct variants, plus loading skeletons, error
  with retry, and not-found.
- Responsive desktop/tablet; sidebar collapses to a drawer below `lg`.
- Removed: `/developer-day`, `/my-activity`, eleven one-off components, and all
  browser-side metric computation.

**Tests**
- 22 unit tests in `@techlio/server-core` covering interval merging, idle
  exclusion, classification, null token totals, coverage gaps, and range
  resolution — the §19 scenarios that are testable without a live connector.
- Connector queue tests prove rows survive until acknowledgement; API crypto
  tests prove exact signed bodies pass and tampering fails.

## 2026-09-21 integrity and phase-audit pass

- Ed25519 keys bind at connector activation; `/v1/events/batch` verifies
  `X-Signature` for issued devices.
- Connector activation requires and audits collection-notice acknowledgement.
- The encrypted queue now uses peek/ack semantics instead of delete/re-enqueue.
- Cursor is truthfully Tier B/companion telemetry; Codex/Gemini are marked
  unavailable and OTLP stubs return 501 instead of silently dropping data.
- Hourly worker finalizes every active employee; coverage-event hours are
  explicitly partial and duplicate version jobs are idempotent.
- Added `docs/PHASE_DELIVERY_AUDIT.md`, ops runbook, and pilot report template.

## Still pending

- Legal/HR (SEC-007/010), pilot report, Phase 0 live validation
- Production OIDC/SSO, TLS, encryption at rest, WCAG, Terraform, ops drills
- FR-024 LLM summaries (deliberately not enabled)
- FR-027 email/Slack delivery (in-app upload and update alerts are in place)
- Live §19 integration: offline queue, long idle, late-event E2E, heartbeat stop,
  pause E2E, signature replay

## 2026-09-21 product-gap pass

- Directory shows the current-hour event count, blank when the connector is not
  online and the hour has no events.
- Employee page renders hourly cards from `/v1/developers/:id/timeline`.
- Session history filters by work item, coverage state, and clock hour.
- Managers can download CSV or a real PDF summary from the organisation overview.

## 2026-09-23 production-truth audit

Full findings, truth map, and proof checklist: `docs/PRODUCTION_TRUTH_AUDIT.md`.

- **Auth:** header auth, published demo passwords, `dev-device-token`, and the
  default JWT secret are gone outside `TECHLIO_DEV_MODE=1` (refused on hosted
  runtimes). Migration 008 disables planted accounts; `pnpm admin:create`
  bootstraps production. Passwords are scrypt.
- **Demo separation:** keepalive, `demo_state`, `isDemo` removed (009). Seed is
  local-only and no longer fabricates Claude tokens or Cursor token budgets.
- **Accuracy:** Tier B rows attributed per person (010) or skipped; Cursor
  puller uses real API fields; AI-plan cards report only measured values in
  matching units; heartbeat-only phantom sessions removed (011); retention is
  org-scoped; late events recalc inline without Redis; directory/session
  summaries computed by the API.
- **Connector:** OS credential store, atomic queue, CSRF + DNS-rebinding
  guard, pause persisted and uploaded while paused, hook dedupe, LaunchAgent /
  Task Scheduler / systemd with `--status` and `--uninstall`, release signing
  tooling.
- **Ops:** `db:migrate` is local-only; production needs `--production`.
  DEPLOY.md rewritten around a greenfield org with no seed.

Still open or blocked: see `pending.md` (legal, certificates, production
credential rotation, SSO, §19 CI suite, Claude OTel tokens).

## 2026-09-23 AI Progress module

- **Capture:** Claude Code OTel (`/v1/logs`, http/json) gives real per-call timing and tokens; hook
  turns for those sessions are dropped. Antigravity adapter from its official hooks (per-call model
  timing, tools, model names; `Stop` ignored; `toolCall.args` never read). Provider allowlist at
  registration and heartbeat.
- **FR-012:** connectors report per-provider capabilities on every heartbeat (pushed immediately on
  change); stored in `connector_health.capabilities` (012) and preferred over the static catalog.
- **API:** `aiProgress` on `/v1/employees/:id`, `/v1/employees/:id/ai-progress/timeline`, live
  `people` strip, effective capabilities on tool/session pages, `received_at`/`late` on session events.
- **UI:** AI Progress panel is the centre of the employee hub (provider cards with capability
  provenance, Tier B daily bars, observed %), day timeline, "Right now" on the overview, turn-aware
  duration labels, late-event badges.
- **Ops:** `/v1/health` reports schema version; schema drift answers 503 with the fix instead of 500.
- **Tests:** adapters 9, server-core 44, puller 5; live `ai-progress` + `tier-b` suites (`LIVE_STACK=1`).
- Docs: `docs/phase0/provider-capability-matrix.md`, `docs/ai-progress-data-lineage.md`.

## 2026-09-23/24 connector as a service, analytics, review fixes

- **Connector packaging:** macOS `.pkg` → `/Library/Application Support/Techlio/Connector`
  + LaunchAgent (no app bundle, no Dock icon) + Swift menu-bar app
  (`apps/connector/macos/TechlioStatus.swift`). Windows `.exe` is GUI-subsystem, hidden
  logon task (Run-key fallback), self-supervising worker, Settings → Apps entry, and a
  PowerShell/WinForms tray (`--tray`, task `TechlioConnectorTray`). Both: pause/resume,
  **stop/start** (stop = `telemetry_gap_started{gap_reason:"stopped"}` + clean exit 0;
  start closes the gap).
- **One connector per OS user:** port 9477–9486 chosen per user and recorded in
  `~/.techlio-connector/port`; hooks, OTel endpoint, menu-bar/tray, IDE companion read it;
  the dashboard discovers only the signed-in person's (or an unactivated) connector.
- **Tracking fixes:** Claude Code file edits now counted (path from `tool_input.file_path`,
  never content); heartbeats no longer stretch sessions/hourly spans; parallel tool calls
  paired by `tool_use_id`; ingest enforces device ↔ developer and Tier B only from
  `provider_pull`; per-event validation; auditors see no live sessions; user tool configs
  never overwritten; transient Keychain/DPAPI failures never regenerate keys.
- **Analytics:** `/leaderboard` (admins + managers only, owner decision 2026-09-23);
  12-month activity calendar and per-day **Workday** graph (working span, AI active, idle,
  exploration, editing, files per hour, periods, breaks, coverage gaps) on each employee.
- **Ops:** production DB has all 12 migrations (verified 2026-09-24). Demo/stray people
  removal: `scripts/purge-demo-data.mjs` (dry run by default; `--keep a,b` keep-list mode;
  `--confirm` deletes in one transaction). Dry run on production 2026-09-24: keep talha,
  Bilal, Rizwan, hassan bajwa; remove 12 seeded `@techlio.local` people + `random@techlio.com`
  (~198k events) — **awaiting the owner's `--confirm` run**.
- **Tests:** server-core 46, provider-adapters 12, connector 6, event-schema 6.

## 2026-09-24 tracking truth, live feed, multi-tenant

- **Multi-tenant:** role `super_admin` in a `platform` organisation (migration 013 adds
  `organizations.kind/created_at/disabled_at`). `/platform` console: create organisation +
  first admin (one-time password), add admins, disable/enable (blocks sign-in and connector
  uploads; data kept). Super admin sees no organisation's activity. Bootstrap:
  `pnpm admin:create --super --email platform@…`. Organisation admins keep managing their own
  accounts under Access.
- **File changes = agent-reported only:** a file/test/build event counts only when an agent
  reported it (`metadata.tool_name` or `telemetry_source` hook/otel/provider_api) —
  `isAgentReported`/`AGENT_REPORTED_SQL` in `activity.ts`, applied in sessions, hourly,
  workday, timeline, file trends. The IDE companion no longer sends saves/typing/tasks/editor
  sessions (only task context). Production had 40 human saves counted as AI edits; migration
  013 recomputes stored session totals. IDE keep-alive pulses never count as work.
- **Activity feed:** `/v1/activity` (range = page filter, keyset pagination, heartbeats
  excluded, role-scoped, team/provider filters) + `ActivityFeed` component on the overview and
  employee hub. Fixed: the employee "Live activity feed" showed the whole org's last events.
- **Unprovided data removed, not placeholdered:** tokens/tests/builds/models/capability badges,
  leaderboard Tokens/Provider-requests columns, AI subscription card, project column appear
  only when some agent/provider reported them.

## 2026-09-24 commits, Verify & ship, integrity pass

- **Commit → Verified → Shipped:** the connector's git watcher (`apps/connector/src/git-watch.ts`)
  watches repos the agents work in (hook `cwd`), reports each commit by the local git user as
  `commit_created` (files changed, lines +/−, `verified` = a passing check — CI gate/pre-commit or
  agent test/build tool — ran in that repo ≤30 min before) and `commit_pushed` when it appears on a
  remote-tracking branch. Only counts + an opaque salted `commit_ref`; never hash, message, author,
  or code. Deterministic event ids (no double counting). The husky post-commit hook now only
  triggers an immediate scan (the old `build_completed/git_commit` signal is gone for new data).
- **Analytics:** `commitSummary` + commits in `fileChangeTrend` (same events, same tz day keys);
  `VerifyShipCard` (funnel + recent commits with state) on overview and employee hub; commits in
  the File changes chart (bars) and the activity feed.
- **Integrity fixes:** "Today"/day presets now start at the org/viewer local midnight (was UTC);
  file-change trend day keys use the same timezone as its SQL grouping; overview headcount honours
  the team filter; overview puts graphs first (usage trend → file changes & commits → tools).
- **Tenant isolation:** project/work-item lookups and assignment validated against the org;
  unused `/v1/stream/sse` (token in URL, no role check) removed; super-admin tenant view
  (`X-Techlio-Org` header) verified: non-super-admins can never switch organisations.
- **Schema:** EXPECTED_SCHEMA_MIGRATION = 014 (014 was added without bumping it).

## 2026-09-24 one time source, commit backfill, connector uninstall

- **One time source for every chart:** `activityTimeline` (work-mix.ts) attributes each minute of
  agent work to the local hour/day it happened (was: whole session on its start hour/day). Used by
  KPIs, usage trend, hour/weekday patterns, per-tool time, Work mix, 12-month calendar, directory,
  leaderboard, and (same rules via `workCategory`/`timedInterval`) the Workday graph. Verified on
  the local DB: all surfaces equal per person and per day. Counts stay session/event based.
- **Work mix replaces the session-count "Session mix" donut:** time split into Verify & ship /
  Writing code / Research & planning / Idle (a session is no longer one label). "Agent work share"
  (always 100% now) replaced by "Working with AI" (employee) and "Idle" (directory).
- **Commits from git:** a newly seen repo backfills the git user's last 14 days of commits (never
  marked verified — unknowable). `pnpm commits:sync` syncs the current repo on demand. Legacy
  `build_completed/git_commit` signals count as commits everywhere.
- **Connector:** Uninstall from the tray / menu bar (keep or remove activation); Windows
  uninstaller cleans its own folder after exit and removes the companion extension; Windows
  upgrade stops the running service first. Windows Pause/Stop fixed (PowerShell sent an empty
  form-encoded POST → Fastify 415; connector now accepts it and the tray sends JSON).
