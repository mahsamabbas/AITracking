# PRD extract (v0.2)

PRODUCT REQUIREMENTS & TECHNICAL HANDOFF
AI Agent Activity Monitoring Dashboard
Near-live operational visibility into developer activity performed through an AI coding agent

Prepared for:  Techlio
Executive sponsor:  Mahsam, CEO
Product owner:  Faisal, Manager
Audience:  Product, Engineering, Operations, Security, and Legal
Version:  0.2 - Revised scope for developer handoff
Date:  3 September 2026

Scope boundary The dashboard observes work performed through the connected AI coding agent. It must not accept developer-submitted hours, compare activity with timesheets, estimate total human effort, or approve billing. Managers will perform any comparison outside this application.

The phrase 'live dashboard' means recent status as events arrive plus a finalized summary for each clock hour. The hourly summary is the authoritative reporting unit for this MVP.
Executive Summary
Techlio needs a management dashboard that shows what development activity is visible through a developer's AI coding agent. A local connector or supported provider integration will collect privacy-minimized activity events, send them to a secure service, and present a chronological view of sessions, model and tool usage, tests, builds, and file-change metadata. The dashboard will update recent status as events arrive and create an evidence-linked summary for every clock hour.
Recommended MVP decision Begin with one confirmed AI coding agent, one organization, a local connector, a secure event pipeline, near-live status, hourly activity summaries, connector-health alerts, and a manager dashboard. Validate the agent's available hooks or logs in a technical spike before committing to a delivery estimate.

1. Product Objective
Provide managers with timely, reviewable evidence of work performed through a connected AI coding agent. The product should make agent activity understandable without exposing unnecessary prompt content, source code, secrets, or personal activity. It is an operational visibility service, not a timekeeping or payroll system.
2. Goals
Show whether each registered agent connector is online, delayed, paused, disconnected, or running an unsupported version.
Display recent agent sessions and activity within 60 seconds of successful event ingestion under normal conditions.
Create one immutable activity summary for each developer and clock hour, finalized within five minutes after the hour ends.
Present model calls, tool activity, tests, builds, file-change metadata, and outcomes in a readable timeline.
Allow a developer to associate an agent session with a project and work item without importing a timesheet.
Clearly identify missing telemetry so managers do not mistake a disconnected connector for inactivity.
Protect client code, credentials, prompts, and private communications through collection minimization and local redaction.
3. Non-Goals
The application will not collect, calculate, verify, approve, or compare developer-submitted or billable hours.
The application will not claim to measure all work performed by a developer; planning, meetings, review, manual coding, and offline work may be invisible.
The application will not infer misconduct, honesty, productivity, or performance from low AI-agent usage.
The MVP will not capture keystrokes, screenshots, private messages, complete source files, or complete prompts and responses by default.
The MVP will not replace project management, code review, source control, payroll, time tracking, or invoicing tools.
The MVP will not create a hidden productivity score. **Decision 2026-09-23 (product owner):** an AI usage leaderboard — a visible table ranked by observed AI usage — is shown to administrators and managers only; employees and auditors cannot see it. It supersedes the earlier "no ranking" rule and must be covered by the legal/HR-approved monitoring notice before any pilot.
4. Stakeholders and Roles
Role | Primary responsibility | Permitted actions
Administrator | Configures organization, users, connectors, and policy | Manage access, retention, integrations, and notification rules
Manager | Monitors agent-visible development activity | View team dashboard, timelines, summaries, and connector alerts
Developer | Runs the connected AI agent | Register connector, select task context, view own data, pause collection, report an incorrect link
Security / auditor | Reviews controls and access history | Read configuration, access logs, retention status, and incident records

Access principle A manager may view activity metadata and summaries for authorized team members. Developers must be able to see the same information collected about them. Client users are not part of the MVP.

5. Definitions and Measurement Boundaries
Term | Definition
Agent event | A timestamped activity record emitted by the selected AI agent or local connector.
Agent active time | Merged duration of observed model and tool operations; it is not total developer working time.
Interactive session span | Time from a session's first to last observed event after configured idle gaps are excluded.
Live status | The most recent known connector and session state, normally visible within 60 seconds.
Hourly summary | A snapshot for one clock hour containing deterministic metrics, outcomes, source events, and an optional generated narrative.
Coverage gap | A period in which the system cannot confirm whether agent events were captured.
Work item context | A project or task identifier selected by the developer for organizing activity; it is not a timesheet record.
Stale connector | A connector that has not sent a heartbeat within the configured threshold.

6. End-to-End Workflow
An administrator registers a developer and issues a revocable device credential for the local connector.
The developer installs the connector, reviews the collection notice, and connects the selected AI coding agent.
Before beginning work, the developer may select a project and work item or leave the session explicitly unassigned.
The connector collects approved metadata, removes secrets and disallowed fields locally, and sends signed event batches.
The ingestion service validates identity and schema, rejects replayed events, and stores events through a durable queue.
The normalizer converts provider-specific events into the common model and groups them into sessions.
The dashboard updates recent status as events arrive and marks delayed or missing telemetry separately from inactivity.
At the end of every clock hour, the summary engine computes metrics and produces an evidence-linked narrative within five minutes.
Managers review current status, hourly summaries, tool/test outcomes, project context, and connector-health alerts.
7. Reference Architecture

Figure 1. Recommended architecture for the activity-monitoring MVP
The connector must use the selected agent's supported interface: native hooks, plugin events, local logs, or a task-aware wrapper. The implementation must not assume that all agents expose the same telemetry. Provider adapters translate available events into one versioned server schema.
8. Functional Requirements
8.1 Identity, Access, and Developer Transparency
FR-001 - Authentication.  Users must authenticate through the approved identity provider; the design must allow future SSO.
FR-002 - Role-based access.  Every API and screen must enforce Administrator, Manager, Developer, and Security/Auditor permissions.
FR-003 - Organization boundary.  All users, devices, projects, sessions, events, summaries, and audit records must be scoped to an organization.
FR-004 - Developer visibility.  A developer must be able to view the events, summaries, connection state, and policy currently associated with their account.
FR-005 - Pause and disclosure.  The connector must show collection status and allow an authorized pause. A pause must create a visible coverage-gap event rather than silently disappearing.
8.2 Agent Connector
FR-006 - Supported provider.  The MVP must support one confirmed AI coding agent. Additional providers must plug into the normalized event model through adapters.
FR-007 - Device registration.  Each connector must use a revocable credential bound to one developer, organization, and installation.
FR-008 - Local redaction.  Secrets, environment values, access tokens, configured sensitive paths, and disallowed content fields must be removed before upload.
FR-009 - Offline queue.  Events must remain in encrypted local storage during network loss and upload later without loss or duplication.
FR-010 - Heartbeat and version.  The connector must send health, version, last-upload, queue-depth, and pause-state information on a configurable interval.
FR-011 - Task context.  A developer may select or change a project/work item. The system must retain context history and visibly label unassigned events.
FR-012 - Capability declaration.  Each connector must report which event types the selected provider can and cannot supply so the dashboard can explain coverage limits.
8.3 Event Collection and Processing
FR-013 - Event capture.  Capture session boundaries, model/tool start and completion times, status, duration, token totals when available, and privacy-safe metadata.
FR-014 - Engineering outcomes.  Capture test, build, lint, type-check, and other approved engineering-check events with start time, completion time, status, and summarized counts.
FR-015 - File-change metadata.  Capture repository-relative path or approved path category, change type, and timestamp. Do not store file bodies by default.
FR-016 - Idempotent ingestion.  Every event must include a stable event ID or fingerprint. Retries and replays must not create duplicate activity.
FR-017 - Sessionization.  Group events by developer, device, provider, project/work item context, and session. Merge overlapping model/tool intervals before calculating active duration.
FR-018 - Idle handling.  Apply a configurable idle threshold to interactive session spans while retaining the raw event timestamps used by the calculation.
FR-019 - Coverage gaps.  Connector pauses, stale heartbeats, unsupported capabilities, upload failures, and outdated versions must be visible as telemetry limitations.
8.4 Live Dashboard and Hourly Summaries
FR-020 - Team overview.  Show each authorized developer's connector state, selected project/work item, current session state, last event time, current-hour event count, and coverage warning.
FR-021 - Recent activity.  New accepted events should appear on the dashboard within 60 seconds under normal conditions without a full page reload.
FR-022 - Hourly timeline.  Display one card per developer and clock hour with session spans, active model/tool duration, tool categories, tests/builds, changed-file counts, tokens when available, and linked source events.
FR-023 - Hourly finalization.  Finalize each hourly snapshot within five minutes after the clock hour ends. Late events must create a versioned recalculation, not silently replace prior results.
FR-024 - Generated summary.  An LLM may describe observed work using allowlisted metadata. Every statement must link to source events, be labeled AI-generated, and be editable only through a versioned correction.
FR-025 - Drill-down.  Managers must be able to open an hourly summary and inspect its session timeline, event types, tool/test outcomes, task context, late events, and coverage gaps.
FR-026 - Filters.  Allow filtering by developer, project, work item, provider, connector state, event type, date/hour, and coverage status.
FR-027 - Notifications.  Notify managers about stale connectors, repeated upload failures, unsupported versions, prolonged unassigned activity, and summary-generation failures.
FR-028 - Export.  Allow authorized users to export activity summaries as CSV or PDF for operational review. Exports must not include timesheet or billing conclusions.
9. Normalized Event Model
Field | Requirement | Purpose / notes
event_id | Required, globally unique | Idempotency key generated at the source
schema_version | Required | Supports additive event evolution and migration
organization_id | Required | Validated by the server from device identity
developer_id / device_id | Required | Identifies the registered developer installation
provider / connector_version | Required | Explains source capability and compatibility
project_id / work_item_id | Optional | Developer-selected context; unassigned remains explicit
session_id | Required for session activity | Groups one related interaction session
event_type | Required | Name from the approved event catalog
occurred_at / received_at | Required | UTC timestamps retained for offline and late delivery
duration_ms | When applicable | Operation duration, not developer working duration
status | When applicable | started, succeeded, failed, cancelled, or unknown
metadata | Restricted object | Allowlisted and redacted; no raw content or secrets
content_fingerprint | When applicable | Detects retries and duplicate records without storing content
consent_version | Required for local events | Policy accepted when activity was captured

10. Approved Event Catalog
Agent lifecycle:  connector_started/stopped, heartbeat_sent, connector_paused/resumed, update_required, upload_failed/recovered.
Session:  session_started, session_heartbeat, session_paused, session_resumed, session_ended, task_context_changed.
Model:  model_request_started/completed with provider, model name, timing, status, and token/cache totals when available.
Tools:  tool_started/completed with allowlisted category such as file_read, file_write, shell, search, test, build, or browser.
Engineering checks:  test_started/completed, build_started/completed, lint_started/completed, typecheck_started/completed.
Files:  file_created, file_modified, file_deleted with repository-relative path or approved path category; no body by default.
Summaries:  hour_opened, hour_finalized, hour_recalculated, summary_generated, summary_failed.
Coverage:  telemetry_gap_started/ended, provider_capability_missing, late_events_received, unassigned_activity_detected.
11. Hourly Aggregation Rules
Use the organization's configured timezone for dashboard hour labels while storing all event timestamps in UTC.
Assign an event to a clock hour using occurred_at, not received_at; show late delivery separately.
Merge overlapping model and tool intervals before summing agent active time so parallel calls are not double-counted.
Calculate interactive session span independently from agent active time and exclude idle gaps after the configured threshold; recommended MVP default: 10 minutes.
Keep counts and durations separate: model duration, tool duration, active merged duration, interactive span, and elapsed session span must never be presented as one metric.
Finalize the hour five minutes after its end. A late event creates a new snapshot version with a visible recalculation time and reason.
If telemetry is incomplete, mark the summary Partial and list the coverage gap. Do not infer what happened during the missing interval.
Generated narratives must describe only observed evidence and use phrases such as 'the agent performed' rather than 'the developer worked.'
12. Dashboard Views
View | Required contents | Primary user
Team status | Connector state, current context, last event, current session, current-hour signals, coverage | Manager
Developer day | Hourly cards, session spans, summaries, tool/test outcomes, context changes, gaps | Manager / Developer
Hourly detail | Source-event timeline, deterministic metrics, generated narrative, late-event versions | Manager / Developer
Connector health | Version, heartbeat, upload lag, queue depth, capabilities, failures, last recovery | Administrator
Audit history | Logins, access, policy changes, connector registration, pause/resume, exports | Security / Auditor

Required empty states The interface must distinguish No activity observed, Connector offline, Collection paused, Provider does not expose this metric, Events delayed, and No task selected. These are not interchangeable states.

13. Data Model
Entity | Key purpose
organizations | Security, policy, timezone, and retention boundary
users / memberships / roles | Identity and organization-specific permissions
developers / devices / connectors | Registered people, installations, provider, version, capability, and health
projects / work_items | Optional organizational context selected for sessions
agent_sessions | Session boundaries, context history, and calculated spans
activity_events | Normalized append-only event stream
hourly_snapshots | Versioned deterministic metrics and completeness state for each clock hour
generated_summaries | Evidence-linked narrative, model metadata, version, and generation status
notification_rules / alerts | Health and data-quality conditions plus delivery state
audit_log | Append-only security-sensitive and policy actions

No timesheet entities The schema must not include hour submissions, approved hours, billing records, invoices, estimate variance, or automated comparisons to developer-provided time.

14. API Requirements
Endpoint | Method | Purpose
/v1/connectors/register | POST | Register a device and issue a revocable credential
/v1/connectors/{id}/heartbeat | POST | Report health, version, capabilities, lag, and queue depth
/v1/events/batch | POST | Ingest signed connector events with idempotency support
/v1/projects | GET | List allowed project context choices
/v1/work-items | GET | List or search optional work-item context choices
/v1/sessions/{id}/context | POST | Record a versioned project/work-item context change
/v1/dashboard/team | GET | Return authorized near-live team status
/v1/developers/{id}/timeline | GET | Return hourly cards and session timeline
/v1/hourly-snapshots/{id} | GET | Return metrics, versions, evidence links, and coverage
/v1/connectors/{id}/pause | POST | Record an authorized pause and create a coverage event
/v1/activity-exports | POST | Create an audited CSV or PDF activity-summary export

All write endpoints must validate schema and organization access, support request IDs and idempotency keys, and create audit records. Dashboard update delivery may use Server-Sent Events or WebSockets; polling is an acceptable MVP fallback if it satisfies the 60-second freshness target.
15. Security, Privacy, and Trust Requirements
SEC-001 - Data minimization.  Collect only metadata required for activity visibility, correlation, reliability, and security. Raw prompts, responses, source code, command text, screenshots, and keystrokes are disabled by default.
SEC-002 - Secrets protection.  Apply local redaction, server validation, log filtering, and secret scanning. Reject events containing disallowed sensitive fields.
SEC-003 - Transport and storage.  Use TLS for network traffic and encryption at rest for local queues, durable queues, databases, backups, and exports.
SEC-004 - Tenant isolation.  Enforce organization scope in every API and query. Support access must be time-limited, approved, and audited.
SEC-005 - Least privilege.  Connector and provider access must use the minimum permissions needed and must never require write access to source repositories.
SEC-006 - Tamper evidence.  Sign connector requests, preserve source timestamps, reject replayed event IDs, and maintain append-only audit records.
SEC-007 - Transparency and consent.  Provide written notice describing collected data, exclusions, purpose, access, retention, pause behavior, and dispute process before monitoring begins.
SEC-008 - Retention and deletion.  Default proposal: detailed events for 90 days and hourly summaries/audit records for one year, subject to legal, contractual, and client-confidentiality requirements.
SEC-009 - Fair interpretation.  Missing telemetry, low agent usage, or low code volume must not be treated as proof of low effort or misconduct.
SEC-010 - Legal review.  Before deployment, review employee/contractor monitoring, privacy, consent, client-confidentiality, and cross-border data requirements in every applicable jurisdiction.
16. Non-Functional Requirements
NFR-001 - Freshness.  Accepted events must appear in live status within 60 seconds under normal conditions; hourly snapshots must finalize within five minutes after the hour.
NFR-002 - Reliability.  Use at-least-once delivery with idempotent ingestion. Network or dashboard outages must not lose queued connector events.
NFR-003 - Performance.  For an MVP of up to 50 developers, a 24-hour team dashboard should load within three seconds at the 95th percentile.
NFR-004 - Availability.  Target 99.5% monthly availability for ingestion and dashboard services during the internal pilot, excluding approved maintenance.
NFR-005 - Observability.  Provide metrics for event lag, queue depth, dropped/rejected events, connector versions, stale heartbeats, hourly job duration, summary failures, and API errors.
NFR-006 - Explainability.  Every displayed aggregate and generated statement must be reproducible from versioned source events, configuration, and timestamps.
NFR-007 - Accessibility.  Manager and developer interfaces should meet WCAG 2.1 AA for keyboard use, contrast, labels, focus, and status communication.
NFR-008 - Deployment.  Provide repeatable infrastructure, environment separation, migrations, backup/restore, rollback, connector upgrade, and incident-response procedures.
17. MVP Delivery Phases
Phase 0 - Telemetry Feasibility and Policy
Select the first AI coding agent and document its available hooks, event stream, local logs, plugin model, and licensing constraints.
Prototype collection of session, model, tool, test/build, file-metadata, token, and health events using sanitized fixtures and one real pilot session.
Approve the monitoring notice, allowed fields, excluded content, retention, access, pause behavior, and dispute path with legal/HR input.
Confirm which metrics are directly observed, inferred, unavailable, or provider-specific before estimating implementation.
Phase 1 - Connector and Event Pipeline
One provider adapter, device registration, consent UI, local redaction, heartbeat, encrypted offline queue, and signed event batches.
Secure ingestion, durable queue, normalized event schema, append-only store, sessionization, idle handling, and coverage-gap detection.
Administrator connector-health view and automated tests for retry, replay, redaction, and stale-connector scenarios.
Phase 2 - Dashboard and Hourly Summaries
Manager team overview, developer-day timeline, hourly detail, filters, near-live updates, and required empty states.
Deterministic hourly metrics, late-event versioning, completeness labels, and evidence-linked generated summaries.
Manager health notifications, developer self-view, audited exports, and seven-day internal pilot.
Phase 3 - Hardening and Expansion
Security testing, performance testing, accessibility review, operational runbooks, backups, and disaster recovery.
Additional AI-agent adapters only after the normalized model is proven by the first provider.
Provider-specific enhancements may be added later, but activity evidence must continue to come from the connected AI agent.
Planning note A delivery schedule should be estimated only after Phase 0 confirms what the selected agent exposes. An external application cannot retrieve data that the agent does not emit or permit through its APIs, hooks, logs, or plugin model.

18. MVP Acceptance Criteria
An administrator can register one supported AI-agent connector and revoke its credential.
A developer can review the collection notice, see collection status, select task context, pause collection, and view their own data.
Agent events upload securely, survive offline operation, and can be retried or replayed without duplication.
Accepted events appear in the authorized dashboard within 60 seconds under normal conditions.
The system creates one versioned summary per developer per clock hour within five minutes after the hour ends.
The hourly card separates model duration, tool duration, merged active duration, interactive span, and elapsed session span.
Late events create a visible recalculation version while retaining the earlier snapshot.
A disconnected or paused connector produces an explicit coverage gap and never an automatic conclusion about developer inactivity.
Managers can drill from an hourly summary to every source event supporting its metrics and narrative.
Raw prompts, responses, source code, command contents, screenshots, keystrokes, and secrets are absent from default payloads and logs.
No screen, API, database entity, export, or notification accepts or compares timesheet or billable-hour data.
Role restrictions prevent access outside the user's organization and authorized team scope.
Every login, configuration change, pause, access, export, and credential action is auditable.
19. Required Test Scenarios
Scenario | Expected result
Offline connector | Events queue locally, upload later, retain occurred_at, and do not duplicate
Overlapping model/tool calls | Intervals merge before active duration is calculated
Long idle session | Elapsed span continues; interactive span excludes the configured idle interval
Late event after finalization | A new hourly snapshot version is created with visible reason and time
Connector heartbeat stops | Status becomes stale and a coverage gap/manager alert is created
Collection paused | Pause is visible to developer and manager; no inactivity conclusion is generated
Provider lacks token data | Metric displays Not available from provider, not zero
Unassigned session | Events remain visible as Unassigned and are not silently linked to another task
Secret in metadata | Local or server validation redacts/rejects it and raises an operational alert
Spoofed/replayed event | Invalid signature or repeated event ID is rejected without changing aggregates
Unauthorized manager request | API denies access and records a security audit event
Attempt to import timesheet | No supported endpoint or UI exists; request is rejected if sent to an event endpoint

20. Developer Deliverables
Architecture decision records for connector integration, event schema, identity, privacy, storage, sessionization, hourly aggregation, and live updates.
Version-controlled source code for the connector, backend services, dashboard, summary worker, notifications, and infrastructure configuration.
Database schema, migrations, seed data, retention jobs, backup/restore procedure, and append-only audit design.
Versioned connector/event API documentation covering authentication, signing, idempotency, validation, batching, retry, and error behavior.
Automated unit, integration, security, and end-to-end tests covering every acceptance criterion and required test scenario.
Deployment, rollback, connector installation/upgrade, operations, incident response, and support documentation.
A pilot report describing actual provider coverage, data gaps, freshness, summary quality, security findings, and recommended next steps.
21. Decisions Required Before Implementation
Which AI coding agent must the first connector support, and what exact APIs, hooks, logs, or plugin interfaces does it expose?
Which operating systems must the connector support in the MVP?
Should project/work-item context be entered manually or synchronized from an existing project-management tool?
What is the organization's reporting timezone, expected work schedule, and stale-heartbeat threshold?
Which tool categories and file-path details are safe to display, and which must be hashed or grouped?
Who may pause monitoring, view individual activity, export summaries, and change retention or notification rules?
Will monitored developers be employees, contractors, or both, and in which jurisdictions will monitoring occur?
What written notice or contractual consent already exists with developers and clients?
Should an hourly generated narrative be included in the MVP, or should the first release show deterministic metrics only?
What detailed-event, hourly-summary, audit, and export retention periods are required?
22. Definition of Done
The MVP is complete when one selected agent passes a real pilot; dashboard events and hourly summaries meet freshness targets; gaps, late events, and provider limitations remain visible; privacy and access controls are approved; acceptance tests pass; and no timesheet, billing, payroll, or developer-ranking feature exists.