# Production-readiness and truthfulness audit

Audited: 2026-09-23 · Scope: every number, state, and label a non-dev deployment
can show, plus the paths that could fabricate, misattribute, or expose data.

**Bottom line.** The analytics pipeline itself was sound, but the deployment
around it was not safe to call production: anyone could act as an administrator
without a password, published demo passwords were planted by migrations, a
single literal token authenticated as a device, and several "live" figures were
invented, misattributed, or silently wrong. Those are fixed in this pass and
verified locally. What remains is either external (legal, signing certificates,
production credential rotation) or listed below as explicit open work — nothing
is marked "partial" to look finished.

---

## 1. Findings

Severity: **P0** exploitable or fabricates data in production · **P1** wrong or
misleading numbers · **P2** hardening.

| # | Sev | Finding | Where | Repro (before fix) | Status |
|---|-----|---------|-------|--------------------|--------|
| F1 | P0 | Unauthenticated admin: any request without a token became a user with whatever `x-role` header it sent, unless `ALLOW_DEV_HEADER_AUTH=0` happened to be set. | `apps/api/src/auth/guards.ts` | `curl /v1/users -H 'x-role: administrator'` → 200 with the user list | **Fixed** — header identity only when `TECHLIO_DEV_MODE=1` on a non-hosted runtime; otherwise 401 |
| F2 | P0 | Published credentials in every database: migration 004 inserted 5 users (`manager123`, `admin123`…); `seedPortalUsers()` re-created them on every boot **and every login**; `authenticatePortalUser` also accepted them from a hardcoded array even if the rows were deleted. | `infra/sql/004`, `server-core/src/users.ts`, `api/src/main.ts`, `auth.controller.ts` | `POST /v1/auth/login manager@techlio.local / manager123` → 201 | **Fixed** — inserts removed; migration 008 disables any account still on a published hash; seeding only in dev mode; fallback removed |
| F3 | P0 | Universal device token: the literal `dev-device-token` authenticated as Alex's device for heartbeats and (outside `NODE_ENV=production`) unsigned batches; migration 002 planted the matching device row. | `server-core/src/devices.ts`, `api/src/events.controller.ts`, `infra/sql/002` | `POST /v1/connectors/…12/heartbeat -H 'Authorization: Bearer dev-device-token'` → 201 | **Fixed** — dev mode only; row removed from 002; 008 revokes existing rows |
| F4 | P0 | Default JWT signing secret `techlio-dev-jwt-secret-change-me` used whenever `JWT_SECRET` was unset — anyone could mint tokens. | `api/src/auth/jwt.ts` | Unset `JWT_SECRET` → API boots and signs with the public default | **Fixed** — API refuses to boot without a ≥32-char non-placeholder secret outside dev mode |
| F5 | P0 | `.env.production.api` (with a `VERCEL_OIDC_TOKEN` JWT) committed and pushed to `github.com/TalhaKhilji23/tracking-app` despite `.gitignore`. | repo root | `git show HEAD:.env.production.api` | **Untracked** in this change. History still contains it — see §5 |
| F6 | P0 | `docs/DEPLOY.md` instructed running `pnpm db:seed` against the production database and smoke-testing with `manager123`. | `docs/DEPLOY.md` | — | **Fixed** — rewritten; seed now refuses any non-local database |
| F7 | P1 | Tier B pullers attributed **every** Cursor/Copilot row in the org to one hardcoded developer (Alex) on a hardcoded device, in a hardcoded org. | `apps/worker/src/index.ts` | Any org-wide Cursor pull lands on Alex's employee page | **Fixed** — rows map by Cursor email or explicit `employee_provider_identities`; unmapped rows are skipped and counted, never reassigned |
| F8 | P1 | Cursor puller read fields that do not exist in the Admin API (`completions`, `linesAdded`, `linesDeleted`, `day`) and wrote request counts into `token_input` / `token_output`. | `packages/puller/src/cursor.ts` | Every pulled row: lines/completions undefined, "tokens" = request counts | **Fixed** — real field names (`totalTabsAccepted`, `totalLinesAdded`, `date`, `subscriptionIncludedReqs`…); no token keys |
| F9 | P1 | AI-plan cards invented budgets (Cursor 500 requests, Claude 2M tokens) when none were configured, and showed "remaining" against them. | `server-core/src/ai-plan.ts` | Fresh org → every card shows a limit and remaining | **Fixed** — no built-in limits |
| F10 | P1 | AI-plan Cursor card: when the employee's Cursor id was unknown, it summed the **whole team's** usage onto that person; it also called the Cursor API on every page view and summed completions + chat into one "billing requests" figure. | `ai-plan.ts` `cursorAdminMonthlyUsage` | Any employee without a mapped Cursor id | **Fixed** — live call removed; Tier B events from the worker are the single source; headline is Cursor's billable request count; chat and completions shown separately |
| F11 | P1 | AI-plan Tier B query referenced `activity_events.metadata` and `.provider`, which do not exist; the error was swallowed and the card rendered empty. | `ai-plan.ts` | Any Tier B data → empty card | **Fixed** — reads `payload` |
| F12 | P1 | Unreported values rendered as 0: AI-plan tokens/requests, hourly token totals (summed with `?? 0`). | `ai-plan.ts`, `server-core/src/hourly.ts`, `web/app/hourly/[id]` | Claude hour with no token data → "0 / 0" or "Not available" for a real 0 | **Fixed** — null means not reported; UI says so |
| F13 | P1 | Capability catalog claimed Claude Code has no missing metrics; its hooks carry no tokens and no per-call model timing (tokens need OpenTelemetry, which the connector rejects with 501). "Model duration" for Claude and Cursor is actually agent-turn duration. | `event-schema/src/providers.ts` | Claude token empty state never shown | **Fixed** — `token_totals`, `model_call_timing` listed; notes say "agent turn (prompt → stop)" |
| F14 | P1 | Phantom sessions: heartbeats and coverage events carrying a session id opened an "agent session", inflating session counts (4 of 5 sessions on the test device were heartbeat-only). | `server-core/src/sessionize.ts` | Pair a connector, wait → sessions appear with no agent activity | **Fixed** — only agent activity opens a session; migration 011 removes existing phantoms |
| F15 | P1 | Pause's coverage-gap event stayed in the local queue until resume (`flushQueue` returned early while paused). | `apps/connector/src/index.ts` | Pause → no `telemetry_gap_started` server-side | **Fixed** — upload continues while paused; verified in DB |
| F16 | P1 | Pause did not survive a restart or reboot — collection silently resumed. | connector | Pause → restart → `paused:false` | **Fixed** — persisted to `state.json`; verified |
| F17 | P1 | Retention job deleted events older than the cutoff across **all** organisations and logged it to one. | `server-core/src/retention.ts` | Multi-org DB → one org's job purges everyone | **Fixed** — org-scoped; worker iterates organisations |
| F18 | P1 | Demo keepalive / `demo_state` / `isDemo`: seeded connectors re-anchored to look online, some rows hidden from coverage math, and a real heartbeat revoked sibling "demo" devices. | `demo-keepalive.ts`, `analytics.ts`, `devices.ts`, `dashboard.controller.ts`, web | `DEMO_CONNECTOR_KEEPALIVE=1` | **Removed** — code deleted, column dropped (009) |
| F19 | P1 | Unknown device ids in pause/resume were attributed to Alex; session context changes were written against Alex's device regardless of the session. | `api/src/connectors.controller.ts`, `sessions.controller.ts` | Pause a random UUID → gap event under Alex | **Fixed** — 404 for unknown devices; context uses the session's own device and owner |
| F20 | P1 | Browser-side aggregation: directory summary tiles and session-history "this page" tiles summed rows in the browser. | `web/app/employees`, `employees/[id]/sessions` | — | **Fixed** — API returns `summary` / `matched` totals over the full filtered set |
| F21 | P1 | Late-event recalculation silently did nothing with `SKIP_REDIS=1` (the Vercel/Render configuration). | `api/src/services/recalc-queue.ts` | Late event on hosted API → no new hourly version | **Fixed** — recalculates inline when Redis is skipped |
| F22 | P1 | Connector local API accepted cross-site "simple" POSTs and DNS-rebound requests: any website could unpair or pause an employee's connector. | connector `index.ts` | `curl -X POST 127.0.0.1:9477/unpair -H 'Origin: https://evil.example'` → 200 | **Fixed** — non-allowlisted `Origin` → 403; non-loopback `Host` → 403; verified |
| F23 | P1 | Packaged hook install appended a new hook entry on every start (dedupe looked for a script name absent in packaged mode) → N restarts = N× event reporting. | `connector/src/agent-hooks.ts` | Restart packaged connector twice → 3 entries per event | **Fixed** — replace, never append; `--uninstall` removes them |
| F24 | P1 | `pnpm db:migrate` read `apps/api/.env.production.local` first, so a routine local migrate could hit production; `sync-vercel-env.sh` pulled production values into `.env.local`, pointing local dev at the production DB. | `scripts/migrate.mjs`, `scripts/sync-vercel-env.sh` | — | **Fixed** — production requires `--production`; pulls go to `.env.production.local` only |
| F25 | P2 | Passwords stored as unsalted SHA-256. | `users.ts` | — | **Fixed** — scrypt with per-user salt; legacy hashes upgraded on login |
| F26 | P2 | Connector secrets in plain files: device token in `identity.json`, Ed25519 key in a world-readable `signing.key`, queue "encryption" keyed by the shared literal `techlio-local-queue`. | connector | `ls -l ~/.techlio-connector/signing.key` → `-rw-r--r--` | **Fixed** — macOS Keychain / Windows DPAPI / Linux Secret Service, 0600 file fallback; per-install random queue key; legacy migrated on first run |
| F27 | P2 | Queue writes were not atomic; a corrupt file was silently reset to empty; undecryptable rows silently dropped. | connector `queue.ts` | — | **Fixed** — temp-file + rename; corrupt file preserved; losses reported as `upload_failed` |
| F28 | P2 | macOS LaunchAgent was written but not loaded until next login; the installer kept running a second foreground copy; Windows task had no crash recovery; no Linux service; no uninstall; duplicate launches crash-looped on the port. | `connector/src/install-service.ts`, `launcher.ts` | — | **Fixed** — see §4 |
| F29 | P2 | Installers ad-hoc signed (`codesign -s -`) — Gatekeeper blocks them when downloaded; Windows exe unsigned. | `scripts/pack-connector.mjs` | — | **Tooling fixed, signing blocked** — `--release` refuses to publish unsigned; needs certificates (§5) |
| F30 | P2 | `apps/web/.next` partially owned by `root` (something ran Next with `sudo`), so `pnpm build` fails for the normal user. | local machine | `pnpm build` → PageNotFoundError | **Local action**: `sudo rm -rf apps/web/.next`. `NEXT_DIST_DIR` added as a workaround |

---

## 2. Truth map

Data lineage (no browser-side aggregation anywhere after F20):

```
Claude Code / Cursor hooks ─┐
IDE companion (VSIX) ───────┼─► connector 127.0.0.1:9477 ─► redaction ─► encrypted queue (peek/ack)
                            │        heartbeat (30s) ───────────────────────────┐
                            └──────────────────────────► signed POST /v1/events/batch ─┐
Cursor Admin API / Copilot report ─► worker (identity-mapped) ─► ingestBatch ─────────┤
                                                                                       ▼
          ingest: schema ▸ secret scan ▸ idempotent insert ▸ sessionize ▸ computeSessionMetrics
                         │                                   │
                  activity_events                     agent_sessions (+ metrics columns)
                         │                                   │
          hourly finalize (worker :05, or inline recalc) ─► hourly_snapshots (versioned)
                                            │
                         server-core/analytics.ts ─► /v1/* ─► apps/web (render only)
```

| Screen / field | Source | Provider limit (FR-012) | Missing · delayed · paused · offline |
|---|---|---|---|
| Overview KPIs, trend, time split | `analytics.organizationAnalytics` over `agent_sessions` | Tier B tools contribute no sessions | Empty range → "No activity observed"; coverage counts from `coverageSummary`; connector state never folded into activity |
| Live connectors, alerts | `/v1/dashboard/live` over `devices(kind='connector')` + `connector_health` | — | online < 5 min · stale · paused (flag) · offline (never). Pull devices excluded |
| Directory row + summary | `listEmployeeDirectory`; summary computed by the API | — | Worst connector state across devices; blank current-hour count when not online |
| Employee AI tool cards | `toolDistribution` | Cursor/Claude: tokens unavailable | Tool cards only for tools with sessions |
| AI subscription card | `ai-plan.employeeAiSubscriptions` | Headline unit per provider: tokens (only if reported), Cursor billable requests (Tier B), agent turns (hooks) | Null ⇒ "Not reported by provider · N sessions observed"; limit only if configured, same unit only |
| Sessions, session detail | `listSessions` (+ `matched` totals), `getSessionDetail` | Model duration = agent turn | `coverage_state` gap/partial ⇒ callout; unassigned ⇒ "No task selected" |
| Hourly card / detail | `hourly_snapshots` | — | Coverage-event hours marked partial; late events ⇒ new version; tokens null ⇒ "Not available from provider" |
| Copilot / VS Code | Tier B / companion events | No sessions, model, tool timing | Tool drill-down shows the capability callout |

---

## 3. PR-sized fix plan

Done in this change (split into these PRs for review):

| PR | Contents | Size |
|----|----------|------|
| A — Auth lockdown | `runtime.ts` gate, guards, JWT boot check, scrypt, `admin:create`, migrations 002/004 cleaned + 008, login panel gated | M |
| B — Demo separation | keepalive/`demo_state`/`isDemo` removed (009), seed local-only + no fabricated tokens/limits, dev-mode scripts | M |
| C — Attribution & accuracy | worker identity mapping (010), Cursor puller fields, AI-plan rewrite, null-not-zero, capability catalog, phantom sessions (011), retention scoping, inline recalc, server-side summaries | L |
| D — Connector service | credential store, queue hardening, CSRF/rebinding guard, pause persistence + upload while paused, hook dedupe, LaunchAgent/Task Scheduler/systemd, `--status`/`--uninstall`, signing tooling | L |
| E — Ops & docs | migrate `--production`, env sync, DEPLOY rewrite, greenfield runbook, this audit, memory bank | S |

Open engineering work (not done; estimates for one engineer):

| Item | Estimate |
|------|----------|
| Admin UI for `employee_provider_identities` (map Copilot logins / Cursor emails) | 1 d |
| Persist connector-reported capabilities per device and use them in coverage views (FR-012) | 1–2 d |
| Claude Code OpenTelemetry ingestion for real token totals and per-call timing | 3–5 d |
| Live §19 integration suite (offline queue, heartbeat stop, pause, late event, bad signature, replay) against a real API + Postgres in CI | 3 d |
| SSO/OIDC (FR-001) and removal of password login for employees | 3–5 d |
| Tray/menu-bar status UI for the connector (health visible without the dashboard) | 2–3 d |
| Signed Windows *service* (not a logon task) via a signed service wrapper | 2 d after certificate |
| Connector auto-update with signature verification | 3 d |
| Email/Slack delivery for FR-027 notifications | 2 d |
| Notification rules for unsupported versions and prolonged unassigned activity | 1 d |

---

## 4. Proof checklist

Verified locally on 2026-09-23 (macOS, Docker Postgres):

- [x] Production-mode API (`NODE_ENV=production`, strong secret): spoofed `x-role` → **401**, `manager123` login → **401**, `dev-device-token` heartbeat → **401**, SSE without token → **401**.
- [x] API refuses to boot with no/placeholder `JWT_SECRET`, and refuses `TECHLIO_DEV_MODE=1` when `VERCEL` is set.
- [x] `pnpm db:seed` refuses a remote host (`ep-x.neon.tech`) and refuses without dev mode.
- [x] No code path reads `demo_state`, `isDemo`, or a keepalive; the column is dropped.
- [x] Seeded connectors go stale on their own; only a real heartbeat marks a connector online (verified: real paired device `online`, seeded dev device `offline`).
- [x] Admin registers a device → developer activates via the connector (collection notice required) → signed heartbeat → **online** on `/v1/dashboard/live`.
- [x] Connector pause → `connector_paused` + `telemetry_gap_started` stored server-side → dashboard alert "paused collection… not a conclusion about their work" → session detail shows the coverage callout and "Telemetry gap started · reason: paused" → resume stores `telemetry_gap_ended`.
- [x] Pause survives a connector restart.
- [x] Second connector launch exits 0 ("already running"), so launchd/systemd do not respawn it.
- [x] Hostile `Origin` POST and DNS-rebound `Host` → 403; dashboard origin and local tools → 200.
- [x] Device token, signing key, and queue key live in the macOS Keychain (`credentialStore: "keychain"`); `identity.json` no longer contains the token; the world-readable `signing.key` is gone.
- [x] `pnpm test`: all packages green (server-core 39, event-schema 6, puller 4, connector 3, aggregation 3, e2e 9).
- [x] Web type-checks and builds (`NEXT_DIST_DIR=.next-build`).
- [ ] macOS LaunchAgent install from the **packaged** DMG on a clean account (needs a rebuilt, signed DMG — §5).
- [ ] Windows Task Scheduler install, crash-restart, and reboot on a real Windows machine.
- [ ] Linux systemd user unit on a real Linux desktop.
- [ ] Production: run `admin:create`, deploy migrations 008–011, confirm demo logins fail there.

---

## 5. Actions outside the codebase

**Production, now (owner: whoever holds Vercel/Neon access):**

1. Assume the production API has been open to F1–F4: check the Vercel project for `ALLOW_DEV_HEADER_AUTH` (if it was ever unset or `1`, F1 was exploitable) and `JWT_SECRET`, and review `audit_log` for unexpected `users.create`, `connector.register`, or export actions.
2. Create a real administrator before deploying: `pnpm admin:create --email you@company.com` against the production `DATABASE_URL`. Migration 008 disables every account still using a published password — without a real admin you would lock yourself out.
3. Deploy this change and run `pnpm db:migrate:prod` (applies 008–011).
4. Rotate `JWT_SECRET` (invalidates any token minted with a default secret) and the Neon database password; re-issue connector credentials if any were created while F1 was open.
5. Decide whether to purge `.env.production.api` from git history (`git filter-repo`, then force-push and re-clone). The committed Vercel OIDC token is short-lived and probably expired, but the history is public to anyone with repo access.
6. Decide whether production currently holds seeded demo data (the old DEPLOY.md told people to seed it). If `SELECT count(*) FROM audit_log WHERE action = 'demo.seed'` is non-zero, the organisation's analytics are fabricated and should be reset.

**Needs purchasing or an owner:**

- Apple Developer ID Application certificate + notarization profile, and an Authenticode code-signing certificate. Then `pnpm connector:pack --release`.
- Legal/HR approval of the monitoring notice and jurisdiction review (SEC-007/010) — unchanged, and still a hard gate.
