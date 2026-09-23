# Pending work vs PRD v0.2

Source: [requirements.md](requirements.md) · Audit: [docs/PRODUCTION_TRUTH_AUDIT.md](../docs/PRODUCTION_TRUTH_AUDIT.md)
Last reviewed: 2026-09-23 (production-truth audit).

Every item is **Done**, **Open** (engineering, can be built), or **Blocked**
(needs an external decision, purchase, or evidence). Nothing is "partial".

---

## P0 — blocks pilot or production approval

| Item | Status | Notes |
|------|--------|-------|
| Remove auth bypasses (header auth, demo passwords, `dev-device-token`, default JWT secret) | **Done** | Fail-closed `TECHLIO_DEV_MODE`; migration 008; boot refuses weak secrets |
| Production credential hygiene after the bypasses | **Blocked — owner action** | Create real admin, deploy 008–011, rotate `JWT_SECRET` + DB password, review audit log, decide on git-history purge (audit §5) |
| Legal/HR approval of notice, consent, retention, access, pause, dispute, jurisdiction (SEC-007/010) | **Blocked — legal** | Notice is still a draft (`docs/policy/monitoring-notice-draft.md`); it now also discloses the manager/admin AI usage leaderboard. Do not start a pilot without sign-off |
| Phase 0 live Claude Code validation, recorded | **Open** | Hooks are proven live locally (2026-09-23); a sanitized, documented pilot session is still required |
| §19 live integration tests (offline queue, heartbeat stop, pause, late event, invalid signature, replay, provider-missing UI) in CI | **Open** | `ai-progress.live.test.ts` and `tier-b.live.test.ts` cover connector → API → dashboard for Claude/Cursor/Antigravity and Tier B (`LIVE_STACK=1`); not yet in CI, and offline/replay/signature cases remain |
| Production database behind deployed code (2026-09-23) | **Blocked — owner action** | Prod runs the audit-pass build without migrations 008+; `devices` queries fail. Run `admin:create`, then `pnpm db:migrate:prod`. `/v1/health` now reports `schema.upToDate` and drift returns 503 with the fix |
| TLS + managed encryption at rest for Postgres, Redis, backups, exports (SEC-003) | **Blocked — infrastructure** | Neon/Vercel provide TLS + at-rest encryption; needs written confirmation and a backup-encryption decision |
| SSO/OIDC (FR-001) | **Open** | ~3–5 d; password login remains, now scrypt-hashed |
| Signed connector installers | **Blocked — certificates** | Apple Developer ID + notarization, Authenticode. Tooling done (`--release`) |

## Review findings (2026-09-23)

Fixed: device may only report its own developer; only provider_pull devices submit Tier B;
per-event validation (a bad event no longer drops the batch; all-bad batch → 400, connector
records `upload_failed`); heartbeats/connector events no longer stretch sessions or hourly
spans (connector stops stamping them with a session id; server ignores them); hourly model/tool
intervals now `[t − duration, t]` like sessions; session `started_at` corrected by late events;
auditors no longer receive live sessions; tool timing paired by `tool_use_id`, parallel calls
no longer deduplicated; unreadable user tool configs never overwritten (atomic writes); user
hooks containing `--hook` no longer deleted; Windows uninstaller no longer kills itself;
transient Keychain/DPAPI failures no longer regenerate keys; `/claim` only pairs with the
configured API (localhost allowed only in local dev). Later the same day: Claude Code
file edits are now counted (path read from `tool_input.file_path`, never content); one
connector per OS user (per-user port recorded in `~/.techlio-connector/port`, dashboard
discovery only uses the signed-in person's connector); per-day Workday graph; demo-data
purge script (`scripts/purge-demo-data.mjs`).

| Open item | Severity | Notes |
|-----------|----------|-------|
| Cursor Tier B rows freeze at first pull of the day (id = hash(day,user), insert-or-ignore) | High | Upsert Tier B rows or only ingest closed days |
| Sessionization reloads the whole session per event (≈8 queries) | High (scale) | Recompute once per session per batch |
| Claude Code run inside Cursor's terminal labelled Cursor | Medium | Decide by payload shape (`transcript_path`) not env vars |
| Org timezone vs UTC day keys; "today" computed in UTC (`range.ts`) | Medium | Use `organizations.timezone` everywhere |
| Concurrent sessions summed can exceed wall-clock time | Medium | Merge intervals per person for totals |
| Late-event recalc race / missing snapshot never recalculated | Medium | Unique `(org,dev,hour,version)`, debounce |
| AiProgressPanel shows 0 for providers whose catalog lists the metric missing | Medium | Show "Not available from provider" |
| `listRecentEvents` sorts on unindexed `received_at`; no `(org, occurred_at)` index | Medium (scale) | Add indexes via migration 013 |
| Windows in-place upgrade silently keeps the old exe (file locked) | Medium | Stop task → copy → start; report failure |
| Queue has no size cap and rewrites the file on each enqueue | Low | Cap + append-only |
| CSV export silently truncated at 5000 events | Low | Say so in the file |
| Project name lookup lacks org filter in session detail | Low | Add `organization_id` predicate |

## P1 — MVP product behaviour

| Item | Status | Notes |
|------|--------|-------|
| Tier B attribution to the right person | **Done** | Email / explicit identity mapping; unmapped rows skipped |
| Admin UI for provider identity mapping | **Open** | ~1 d; today via SQL on `employee_provider_identities` |
| Cursor puller uses real Admin API fields | **Done** | Verified against cursor.com/docs 2026-09-23 |
| Cursor Analytics endpoints (team DAU, agent edits) | **Deferred** | Field names unverified and team-level rows cannot be attributed to a person; no longer ingested |
| AI-plan usage truthful (no invented limits, no team fallback, unit-matched) | **Done** | |
| Claude Code token totals | **Done** | Connector ingests OTLP/HTTP JSON `api_request` on `/v1/logs`; hook turns dropped for OTel sessions. Metrics/traces still 501 |
| Persist connector-reported capabilities (FR-012) | **Done** | Per-provider report on every heartbeat → `connector_health.capabilities` (012); UI shows live vs catalog |
| Antigravity adapter | **Done** | Official hooks (`~/.gemini/config/hooks.json`); per-call model timing, tools; no tokens. Needs a run on a machine with Antigravity installed |
| AI Progress module (API + UI) | **Done** | `aiProgress`, `/ai-progress/timeline`, live `people`, late-event flags; lineage in `docs/ai-progress-data-lineage.md` |
| Durable server-side ingestion queue vs direct Postgres | **Open — decision** | Record an ADR; connector queue already gives at-least-once |
| Notifications: unsupported version, prolonged unassigned, summary failure; email/Slack (FR-027) | **Open** | In-app upload-failure and pause/stale/offline alerts are done |
| FR-024 generated summaries | **Deferred** | Off by decision (open-decisions #9); UI states metrics are deterministic |
| Hourly completeness includes stale/offline/upload gaps; late delivery exposed | **Open** | Coverage-event hours already partial |
| Late-event recalculation without Redis | **Done** | Inline fallback |
| Seven-day internal pilot + report | **Blocked** | After legal approval and signed installers |

## P2 — production hardening

| Item | Status | Notes |
|------|--------|-------|
| Connector as a real per-user service (macOS LaunchAgent, Windows task w/ restart, Linux systemd) | **Done in code** | macOS `.pkg` → `/Library/LaunchAgents`, no app/Dock icon; verified per-user install, crash restart, hook delivery on macOS (2026-09-23). Windows exe is GUI-subsystem (no console), hidden task + Run-key fallback + Settings → Apps entry — needs a run on a clean Windows machine, and the signed `.pkg` |
| Windows SCM service (LocalSystem) instead of per-user logon task | **Open — decision** | Would need a per-user helper for hooks/DPAPI; only if IT requires a service visible in services.msc |
| OS credential store for connector secrets | **Done** | Keychain / DPAPI / Secret Service, 0600 fallback |
| Connector tray / menu-bar health UI | **Done in code** | macOS Swift menu-bar app; Windows PowerShell/WinForms tray (`--tray`, own logon task). Both: pause/resume, stop/start with confirmation, dashboard, log. Windows tray untested on a real Windows machine |
| Connector auto-update with signature check | **Open** | ~3 d |
| Support-access workflow (SEC-004) | **Open** | |
| DB-enforced append-only audit (SEC-006/008) | **Open** | |
| 365-day retention for snapshots and audit | **Blocked — legal** | 90-day event retention is done and now org-scoped |
| Request IDs / idempotency keys on write APIs | **Open** | |
| Operational metrics (NFR-005), availability SLO (NFR-004) | **Open** | |
| 50-developer load test (NFR-003) | **Open** | |
| WCAG 2.1 AA automated checks + review (NFR-007) | **Open** | |
| IaC, environment separation, DR drills (NFR-008) | **Open** | Runbook exists; drills not executed |
| Remaining ADRs (identity, privacy, storage, sessionization, hourly, live updates) | **Open** | |
| Codex / Gemini adapters | **Deferred** | Only after Claude Code passes the pilot |

---

## Policy & gates

| Item | Status |
|------|--------|
| Monitoring notice approved (SEC-007) | Blocked — draft only |
| Legal / HR (SEC-010) | Blocked |
| Section 21 open decisions | Open — `docs/policy/open-decisions.md` |
| Definition of Done (§22) | Not met |

## Portals (unchanged)

| Role | Sees | Cannot see |
|------|------|------------|
| Administrator | Users, connectors, policy, audit, org analytics | Other organisations |
| Manager | Org analytics, employees, sessions, alerts, exports | User admin, credentials, audit |
| Developer | Own analytics, own connectors, pause/resume, notice | Other people, exports, audit, admin |
| Auditor | Audit log, connector health, policy | Individual activity, exports, mutations |
