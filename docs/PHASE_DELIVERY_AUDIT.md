# Delivery phase audit

Reviewed: 2026-09-21 · provider section corrected 2026-09-23  
Source: `memory-bank/requirements.md` (readable PRD v0.2 extract), implementation,
tests, infrastructure, and memory bank.

## Conclusion

Techlio is a working local Phase 1–2 prototype. It has not completed the PRD
Definition of Done because Phase 0 human gates, the seven-day pilot, and most
Phase 3 production controls remain open.

## Phase 0 — partial

Implemented:

- Claude Code is the named first Tier A target.
- Claude hooks, connector ingestion, a capability matrix, and an integration ADR
  exist.
- The collection notice, allowed metadata, exclusions, retention proposal,
  pause behavior, and open decisions are documented.

Still required:

- Run and record one real sanitized Claude Code pilot session.
- Confirm actual hook, OTel, token, licensing, and operating-system coverage.
- Obtain legal/HR approval for notice, retention, access, pause, dispute, client
  confidentiality, jurisdiction, and cross-border rules.
- Keep unsupported metrics marked unavailable; do not estimate them.

## Phase 1 — substantially implemented, not complete

Implemented:

- Admin-issued, revocable connector credentials bound to an employee and tool.
- Developer activation with explicit collection-notice acknowledgement.
- Ed25519 public-key binding and signed event-batch verification.
- Strict allowlist event schema, local redaction, and server secret rejection.
- AES-256-GCM SQLite queue with peek/ack at-least-once delivery semantics.
- Heartbeat, queue depth, pause state, normalized ingestion, idempotent event IDs,
  sessionization, idle handling, coverage events, and connector-health UI.
- Unit tests for schema, redaction, queue acknowledgement, signing, interval
  merging, idle handling, and connector state.

Still required:

- Add a durable server-side ingestion queue if direct Postgres ingestion is not
  accepted as the durability boundary.
- Add live integration tests for offline recovery, heartbeat stop, pause,
  late-event recalculation, invalid signature, and replay through the API.
- Persist connector-reported capability declarations rather than relying only
  on the static catalog.
- Emit and alert on repeated upload failures and unsupported connector versions.

Provider truth:

- Claude Code and Cursor are both observed through agent hooks (sessions,
  agent turns, tool calls, file edits). Neither hook stream carries token
  totals, and "model duration" is the agent turn (prompt → stop). Claude token
  totals need OpenTelemetry ingestion, which is not built (routes return 501).
- Cursor daily request counts come from the Admin API via the worker, attributed
  per employee by email (see `docs/PRODUCTION_TRUTH_AUDIT.md`).
- Codex and Gemini adapters are planned, not implemented. Their OTLP routes now
  reject with `501` instead of silently discarding telemetry.
- GitHub Copilot is daily aggregate telemetry when enterprise credentials exist.

## Phase 2 — partial

Implemented:

- Organization overview, employee directory, employee/tool/session drill-down,
  near-live polling, filters, required coverage wording, and developer self-view.
- Deterministic session/hour metrics with separate model, tool, merged active,
  interactive, and elapsed durations.
- Immutable hourly versions for late recalculation.
- Worker finalization for every active employee, including explicit partial
  snapshots for empty or coverage-gap hours.
- In-app connector alerts and audited CSV/text export API.

Still required:

- Wire the existing developer timeline API to an hourly-card day view.
- Add work-item, coverage, and clock-hour filters where required.
- Add export controls to the manager UI and produce a real PDF.
- Implement repeated-upload, unsupported-version, and summary-failure alerts.
- Decide whether FR-024 generated narratives are in scope. If enabled, add
  evidence links, model metadata, versioned corrections, and failure handling.
- Run the seven-day internal pilot and write its report.

## Phase 3 — incomplete

Implemented foundations:

- Organization-scoped RBAC, developer self-scope, privacy-safe schema, encrypted
  local queue, migrations, Docker images, retention of detailed events, and
  deterministic evidence links.

Still required:

- TLS and managed encryption at rest for Postgres, Redis, backups, and exports.
- Database-enforced append-only audit policy and approved support-access flow.
- Performance/load test for 50 developers and a documented p95 result.
- Availability SLO monitoring and operational metrics.
- Automated accessibility checks plus a formal WCAG 2.1 AA review.
- Production infrastructure-as-code and environment separation.
- Execute backup/restore, rollback, connector-upgrade, incident, and DR drills.
- Package and sign macOS/Windows connectors and use OS keychain storage.

## Gates that code cannot complete

The following must not be marked complete without external evidence:

- Legal/HR approval and jurisdiction review.
- Provider plan/licensing and enterprise-token validation.
- A real seven-day pilot.
- Production TLS/KMS, availability evidence, and cloud DR execution.
- Formal security and accessibility assessments.

Use `docs/ops/runbook.md` for the local operational baseline and
`docs/pilot-report-template.md` to record the real pilot.
