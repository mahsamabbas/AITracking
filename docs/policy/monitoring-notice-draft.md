# Employee monitoring notice (draft — SEC-007)

**Status:** Draft for legal/HR review (SEC-010). Do not deploy monitoring until approved.

## Purpose

Operational visibility into development activity performed through connected AI coding agents. This is not timekeeping, payroll, or billing approval.

## What we collect

- Agent session boundaries, model and tool operation timing and status (metadata only)
- Token totals when the provider exposes them
- Test/build/lint outcomes as reported by the connector
- File-change metadata (paths or categories, not file contents)
- Connector health (version, heartbeat, pause state)

## What we do not collect by default

- Keystrokes, screenshots, private messages
- Complete prompts, responses, source files, or shell command text
- Secrets and credentials (redacted locally before upload)

## Who can access

Managers: authorized team metadata and summaries. Developers: the same data collected about themselves. Administrators: configuration and connector health.

**AI usage leaderboard (added 2026-09-23, needs legal/HR approval):** administrators
and managers can see a table ranking employees by observed AI agent usage (AI active time,
sessions, model and tool calls, file changes, tokens where reported). Employees and auditors
cannot see it. It measures AI tool usage only, not performance or effort.

## Retention (default proposal)

Detailed events: 90 days. Hourly summaries and audit records: 1 year. Subject to contract and legal requirements.

## Pause and disputes

Developers may pause collection; pauses appear as coverage gaps, not silent gaps. Disputes: contact [HR contact TBD].

## Open decisions (Section 21)

See `docs/policy/open-decisions.md`.
