# Analytics engine

## Pipeline
event (connector) → `ingest.ts` (token, org, signature, Zod, secret scan, remote-pause filter,
developer binding, dedupe by `event_id` — 50k in-memory + unique index) → `activity_events`
→ `sessionize.ts` / `sessions.ts` (session metrics, classification) → `hourly.ts` (versioned
snapshots; late events → recalculation awaited inline in production) → reads.

## One time source
`activityTimeline()` in `server-core/src/work-mix.ts` merges each person's agent intervals
(`personIntervals`, shared with the retention rollup) and spreads them over local hours/days in
the reporting timezone: active, idle (gaps ≥ 10 min), working, verify/writing/research, by day,
hour, weekday, provider, developer. **Every** time KPI/chart goes through `withEventTime`
(analytics.ts): headline, trends, patterns, per-tool, teams, directory, leaderboard, AI progress
cards (`withEngineActive`), workday. Never compute a displayed time from session columns next
to engine numbers — the pages would disagree.

## Counts
Sessions, requests, tool calls, file changes come from sessions/events. File/test/build events
count only when agent-reported (`isAgentReported` / `AGENT_REPORTED_SQL`; migration 013).
Commits: totals over all commits in range (SQL), 25 most recent listed; hidden under a tool filter.

## Retention interplay
Before `retention_state.summarized_before` the engine reads `activity_hourly`; after it, raw
events. No double counting. Details: [../04-operations/data-retention.md](../04-operations/data-retention.md).

## Timezones
Reporting buckets: viewer display timezone (header) or org default (`resolveReportingTimezone`).
Calendar `from/to` are local days, inclusive `to` (`range.ts`). Day keys `YYYY-MM-DD` are
formatted in UTC on the web so they never shift a day. `previousRange` compares like-for-like
partial periods.

## Invariants
Five durations never summed; unavailable ≠ zero (`null` stays null); coverage gaps never idle;
classification describes telemetry, not people.
