# AI Progress — data lineage

Every number on the AI Progress surfaces traces to stored events. Nothing is
computed in the browser beyond formatting and stacking bars.

```
hook / OTel / Tier B pull ─► activity_events (payload JSONB, occurred_at, received_at)
                               │
                               ├─ sessionize.ts ─► agent_sessions + computeSessionMetrics (sessions.ts)
                               │                     five durations · counts · tokens (nullable) · models · categories
                               ├─ hourly.ts (worker :05 / inline recalc) ─► hourly_snapshots (versioned)
                               └─ provider_daily_aggregate rows (Tier B, no sessions)
                                               │
                  server-core: ai-progress.ts · analytics.ts · ai-plan.ts
                                               │
                  API: /v1/employees/:id (aiProgress) · /tools/:provider · /ai-progress/timeline
                       /v1/sessions/:id · /v1/dashboard/live (people)
```

## Employee hub → AI progress card (per provider)

Source: `aiProgress()` in `packages/server-core/src/ai-progress.ts`, one `GROUP BY s.provider`
over `agent_sessions` where `started_at` is in range.

| Field | SQL / origin | When unavailable |
|-------|--------------|------------------|
| Sessions | `COUNT(*)` | — |
| Agent active | `SUM(active_duration_ms)` — union of model and tool intervals per session (§11) | — |
| Model calls / Agent turns | `SUM(model_requests)` — completed `model_request_completed` events. Label is **Agent turns** when capability `missing` has `model_call_timing` | — |
| Tool calls | `SUM(tool_calls)` — `tool_completed` events | — |
| File changes | `SUM(file_changes)` — `file_created/modified/deleted` | — |
| Tests · builds | `SUM(tests_run)`, `SUM(builds_run)`, failures from `tests_failed + builds_failed` | "None run" |
| Tokens in / out | `SUM(token_input)`, `SUM(token_output)` — SQL `SUM` of all-NULL is NULL | **null → "Not available from provider"** |
| Models | `jsonb_array_elements_text(models_used)` grouped per provider | "Not reported" |
| Share of AI time | provider `active_ms` ÷ person's total `active_ms` (server) | 0 |
| Capability badge | `effectiveCapabilities()`: newest `connector_health.capabilities` report ≤ 48h from this person's `kind='connector'` devices; else `PROVIDER_CAPABILITIES` | "Catalog capability" |
| Observed % | `observedSpanMs ÷ (observedSpanMs + gapMs)`; gaps pair `telemetry_gap_started` with the next `telemetry_gap_ended` on the same device (open gap → range end / now) | null when neither exists |

## Tier B daily bars

`provider_daily_aggregate` rows for the person, grouped by `metadata.aggregate_day` and provider.
Each series is `SUM((payload->'metadata'->>key)::bigint)`; a key the provider never sends stays
**null** and its series is not drawn.

| Series | Metadata key | Written by |
|--------|--------------|------------|
| Billable requests | `billable_requests_count` = `subscriptionIncludedReqs + usageBasedReqs + apiKeyReqs` | `packages/puller/src/cursor.ts` |
| Chat requests | `chat_requests_count` | Cursor |
| Agent requests | `agent_requests_count` = `agentRequests + composerRequests` | Cursor |
| Accepted completions | `completions_count` = `totalTabsAccepted` | Cursor |
| Suggestions / acceptances | `suggestions_count`, `acceptances_count` | Copilot |

Attribution: `resolveProviderEmployee()` — explicit `employee_provider_identities`, else a unique
case-insensitive `employees.email` match; otherwise the row is skipped and counted.

## Day timeline

`aiProgressTimeline()` — `activity_events` for one org-timezone day, `GROUP BY hour, provider,
event_type, status`. Bars stack `model_request_completed + tool_completed + file_* + check
completions`; `telemetry_gap_started`, `connector_paused`, `upload_failed` render as a separate
amber mark, never as low activity. Session list: `agent_sessions` started that day.

## Other AI-progress surfaces

| Surface | Field | Origin |
|---------|-------|--------|
| Tool page | all KPIs | `activityTotals`, `dailyTrend`, `modelBreakdown`, `toolCategoryBreakdown` scoped by `provider` |
| Tool page | capability callout | `capabilityFor()` in `analytics.controller.ts` (live report → catalog) |
| Session detail | five durations | `agent_sessions` columns from `computeSessionMetrics` |
| Session detail | "arrived late" | `activity_events.received_at − occurred_at > 5 min` (`LATE_EVENT_MS`) |
| AI subscription card | usage headline | `ai-plan.ts`: tokens (only if reported) › Cursor `billable_requests_count` › model requests; limits only if configured, same unit |
| Overview "Right now" | provider, state, last model/tool, events this hour | `/v1/dashboard/live` `people`: non-heartbeat events in the last 2h; *active* = event < 10 min |
| Hourly detail | durations, counts | `hourly_snapshots.metrics`; tokens null when no event reported any |

## Manual AI progress checklist

1. `pnpm dev` (API dev mode, web, connector). Pair the connector from **My connectors**.
2. Open Claude Code (a new session, so the OTel env applies) and run one prompt that edits a file.
3. Within 60 s: overview **Right now** shows you as *Agent active* with Claude Code and the last tool.
4. Employee hub → AI progress → Claude Code card: *Live capability*, **Model calls** (not turns),
   tokens shown. Cursor card (if used): **Agent turns**, tokens "Not available from provider".
5. Open the session: model duration equals the sum of the OTel call durations; no second
   model request for the turn.
6. Hub card totals equal the sums across rows in **All sessions** for today (automated in
   `tests/e2e/scenarios/ai-progress.live.test.ts`, run with `LIVE_STACK=1`).
7. Pause the connector: Day timeline shows the amber gap mark; Observed % drops; nothing
   counts as idle.
