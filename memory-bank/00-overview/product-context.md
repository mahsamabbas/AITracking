# Product context

## Roles and portals

Defined in `packages/server-core/src/roles.ts` (the API is the authority) and mirrored in
`apps/web/src/lib/permissions.ts` (the UI hides what a role cannot do).

| Role | Portal / landing | Can | Cannot |
|------|------------------|-----|--------|
| **super_admin** | Platform portal `/platform` | Create, rename, disable customer organisations; issue their first admins; open a customer workspace `/platform/[orgId]/…` (acts as that org's administrator via `x-techlio-org-id`) | See any organisation's activity without entering its workspace |
| **administrator** | Organisation dashboard `/` | Everything in the org: analytics, Access (users, roles, connector keys), Connectors (pause/resume/revoke), Audit, exports, Settings incl. organisation logo and Data & archive, delete an employee | Other organisations |
| **manager** | Organisation dashboard `/` | Analytics, directory, drill-down, leaderboard, connector health, exports | User admin, credentials, audit |
| **developer** | Own analytics `/employees/<self>` | Same analytics as a manager, scoped to themselves (FR-004 parity); My connectors (activate key, pause/resume); Install agent (shown while no connector answers on this computer) | Other people, exports, audit, admin |
| **auditor** | Controls review | Audit log, connector health, policy, Data & archive | Individual activity (`assertCanViewPeople`), exports, mutations |

Developers must see the same data collected about them. Until a developer's connector is
installed and paired, the dashboard is locked to the setup pages.

## Core workflow

Organisation → Employees → Employee → AI tool → Sessions → Session detail.
Every screen exists to serve one step of it.

**Connector control:** administrators issue a device ID + token per employee and AI tool
(dropdown lists every catalogue tool). Developers only activate that key on their machine.
They cannot register arbitrary tools. The connector then observes every supported tool on
that computer.

## Pages

`/login` · `/` overview · `/employees` · `/employees/[id]` · `/employees/[id]/tools/[provider]` ·
`/employees/[id]/sessions` · `/sessions/[id]` · `/hourly/[id]` · `/leaderboard` · `/connectors` ·
`/my-connectors` · `/setup-connector` · `/users` (Access) · `/audit` · `/policy` · `/settings`
(Profile · Appearance · Security · Organisation · Data & archive) · `/platform` · `/platform/[orgId]/*`.

## Non-goals

No keystrokes/screenshots/full prompts/code/commit messages. No hidden productivity score
(the visible leaderboard is an explicit owner decision, admins/managers only). No timesheet
comparison (`POST /v1/events/timesheet` returns 404 by design). Missing telemetry is a
coverage gap, never evidence of inactivity.
