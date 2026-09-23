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
| Legal/HR approval of notice, consent, retention, access, pause, dispute, jurisdiction (SEC-007/010) | **Blocked — legal** | Notice is still a draft; do not start a pilot without it |
| Phase 0 live Claude Code validation, recorded | **Open** | Hooks are proven live locally (2026-09-23); a sanitized, documented pilot session is still required |
| §19 live integration tests (offline queue, heartbeat stop, pause, late event, invalid signature, replay, provider-missing UI) in CI | **Open** | Manual verification done for pause/resume/gap; automated suite not written (~3 d) |
| TLS + managed encryption at rest for Postgres, Redis, backups, exports (SEC-003) | **Blocked — infrastructure** | Neon/Vercel provide TLS + at-rest encryption; needs written confirmation and a backup-encryption decision |
| SSO/OIDC (FR-001) | **Open** | ~3–5 d; password login remains, now scrypt-hashed |
| Signed connector installers | **Blocked — certificates** | Apple Developer ID + notarization, Authenticode. Tooling done (`--release`) |

## P1 — MVP product behaviour

| Item | Status | Notes |
|------|--------|-------|
| Tier B attribution to the right person | **Done** | Email / explicit identity mapping; unmapped rows skipped |
| Admin UI for provider identity mapping | **Open** | ~1 d; today via SQL on `employee_provider_identities` |
| Cursor puller uses real Admin API fields | **Done** | Verified against cursor.com/docs 2026-09-23 |
| Cursor Analytics endpoints (team DAU, agent edits) | **Deferred** | Field names unverified and team-level rows cannot be attributed to a person; no longer ingested |
| AI-plan usage truthful (no invented limits, no team fallback, unit-matched) | **Done** | |
| Claude Code token totals | **Open** | Requires OpenTelemetry ingestion (OTLP routes currently 501); until then tokens are "not reported" |
| Persist connector-reported capabilities (FR-012) | **Open** | ~1–2 d |
| Durable server-side ingestion queue vs direct Postgres | **Open — decision** | Record an ADR; connector queue already gives at-least-once |
| Notifications: unsupported version, prolonged unassigned, summary failure; email/Slack (FR-027) | **Open** | In-app upload-failure and pause/stale/offline alerts are done |
| FR-024 generated summaries | **Deferred** | Off by decision (open-decisions #9); UI states metrics are deterministic |
| Hourly completeness includes stale/offline/upload gaps; late delivery exposed | **Open** | Coverage-event hours already partial |
| Late-event recalculation without Redis | **Done** | Inline fallback |
| Seven-day internal pilot + report | **Blocked** | After legal approval and signed installers |

## P2 — production hardening

| Item | Status | Notes |
|------|--------|-------|
| Connector as a real per-user service (macOS LaunchAgent, Windows task w/ restart, Linux systemd) | **Done in code** | Needs verification on clean Windows and Linux machines, and from the signed DMG |
| Windows Service (not logon task) | **Open** | After Authenticode certificate |
| OS credential store for connector secrets | **Done** | Keychain / DPAPI / Secret Service, 0600 fallback |
| Connector tray / menu-bar health UI | **Open** | ~2–3 d; `--status` and dashboard cover it today |
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
