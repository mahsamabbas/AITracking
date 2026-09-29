# Product context

## Roles

- **Administrator** — org, users, connectors, policy
- **Manager** — organisation analytics, employee directory, sessions, alerts
- **Developer** — run the agent, pause, pick task context, and see their own
  analytics on the *same* screen a manager sees
- **Security / auditor** — read-only config and audit history; no individual
  timelines

Developers must see the same data collected about them.

## Core workflow

Organisation → Employees → Employee → AI tool → Sessions → Session detail.
Every screen exists to serve one step of it.

**Connector control:** administrators issue a device ID + token per employee and AI
tool. Developers only activate that key on their machine. They cannot register
arbitrary tools.

## Non-goals

No keystrokes/screenshots/full prompts. No developer ranking or productivity
score. No timesheet comparison. Missing telemetry is a coverage gap, never
evidence of inactivity.
