# Active context

**Date:** 2026-09-24 (see "Current state" at the end)

## Shape of the product

One drill-down path, and every screen serves it:

```
Organisation → Employees → Employee → AI tool → Sessions → Session detail
```

- `/` organisation overview — KPIs with period-over-period comparison, usage
  trend, observed time split, tools, teams, working-hour pattern, coverage, live
  connector and session strip.
- `/employees` directory — search, team / AI tool / connector-state filters,
  sort, usage, productive share, sessions, avg session, sparkline, last active.
- `/employees/[id]` — the analytics hub. Also the **developer's own landing
  page**: FR-004 wants parity, not a reduced self-view.
- `/employees/[id]/tools/[provider]` — one employee's use of one AI tool, with
  that provider's declared capability limits.
- `/employees/[id]/sessions` — paged history, filtered by tool, activity type,
  and project.
- `/sessions/[id]` — five durations, usage metrics, task-context versions, full
  event timeline filterable by activity type.
- Supporting: `/hourly/[id]`, `/connectors`, `/users`, `/audit`, `/policy`.

Removed in the refactor: `/developer-day` and `/my-activity` (both folded into
the employee analytics page), and all browser-side metric computation.

## Where the numbers come from

- `computeSessionMetrics` (`packages/server-core/src/sessions.ts`) is the single
  source of truth for the §11 rules. Metrics are **columns on `agent_sessions`**,
  written on ingest and by the seed.
- `packages/server-core/src/analytics.ts` holds every aggregate the dashboard
  reads. Nothing is computed in the browser.
- `resolveRange` (`range.ts`) resolves today / yesterday / 7d / 30d / 90d /
  custom; `previousRange` gives the comparison window.

## Productive vs idle — the wording that matters

The brief asked for productive vs non-productive activity; the PRD forbids
productivity scores and rankings (§3, SEC-009). Resolved by classifying
**observed agent activity**, not people:

`engineering_output` · `assisted_editing` · `exploration` count as productive
agent activity; `idle_dominant` reads "Mostly idle" and its explanation says
plainly that it describes the telemetry, not the person. Coverage gaps are a
third, separate category — never folded into idle.

## Demo data

`pnpm db:seed` builds a deterministic 12-person org: ~2,300 sessions and
~237,000 events over 90 days across Cursor, Claude Code, Copilot, and the VS Code
companion. It deliberately includes stale/offline/paused connectors, a person
with no telemetry, unassigned sessions, mid-session coverage gaps, failed tests
and builds, and weekend/idle patterns.

The seed is local-only (dev mode + local DB host, else it refuses). Seeded
heartbeats go stale on their own — there is no keepalive and no `demo_state`.
It does not fabricate Claude token totals, because real hooks cannot report
them. Alex is the live machine identity: only a Cursor device slot is seeded.
Production is an empty org until real devices report (docs/DEPLOY.md).

## Local run

```bash
docker compose up -d postgres redis
pnpm db:migrate && pnpm db:seed
pnpm dev            # API 3001, web 3000, connector 9477
pnpm dev:worker     # optional: hourly finalise, recalc, retention
```

**Employee connector:** download the program from the hosted dashboard (Install
agent). Do not ask employees to clone this repo or run `pnpm dev:connector`.
That script is only for maintainers working in this monorepo.

**Live agent events:** on startup the connector installs Claude Code and Cursor hooks. They report tool and model timing only — not prompts, command text, or file contents. Dashboard health checks are not printed. Claude’s website chat is outside Claude Code and does not emit these events.

**Backlog:** [pending.md](pending.md).

## UI information architecture and motion (2026-09-23)

Spec: `apps/web/UX_SPEC.md`. Rules to preserve when editing any screen:

- Command center `/` → People (`/employees`, `/employees/[id]`) → Drill-down
  (tool, sessions, session) → Connector onboarding → Admin. Breadcrumbs on
  every drill-down page.
- Analytics pages start with `ContextBar` (subject · range · org timezone ·
  *Data as of* · refresh · Live). `useApi` exposes `fetchedAt`.
- KPI deltas are neutral arrows. No red/green on people metrics.
- Filters stick below the header on `lg+` only (`--header-h` is set by AppShell).
- Employee hub order: identity → KPIs → trend → tools → projects/files → AI
  subscription → hourly → sessions → patterns/detail.
- Motion tokens `--motion-fast/normal/slow`; `.enter`, `.stagger`,
  `.drawer-in`, `.pulse-online` (online connector only), `useChartAnimation()`.
  Everything is instant under `prefers-reduced-motion`.
- Focus is always visible (`--focus-ring`); never reintroduce
  `outline: none` without a replacement.

## Current state (2026-09-24)

- **Production:** API `tracking-app-api-three.vercel.app`, web `tracking-app-api-t9yd.vercel.app`,
  Neon Postgres with migrations 001–012 applied. Real people: talha, Bilal, Rizwan, hassan bajwa.
  Seeded demo people are still present until the owner runs
  `node scripts/purge-demo-data.mjs --production --keep talha,bilal,rizwan,hassan --confirm`.
  The only administrator login is still `admin@techlio.local`; create a real admin
  (`pnpm admin:create`) before removing it. **Rotate the Neon password** — it was shared in a
  chat session on 2026-09-24.
- **Deploy order for the current branch:** API first (event schema gained
  `gap_reason:"stopped"`), then web, then reinstall connectors (`.pkg` / `.exe`) on every machine.
- **Employee hub order now:** identity → 12-month activity calendar → Workday (selected day) →
  coverage callouts → KPIs → trend → AI progress → … (UX_SPEC §4 order otherwise unchanged).
- **Leaderboard** exists by owner decision (admins/managers only) — rule 8 in systemPatterns.md
  was updated accordingly.
- **Untested on real hardware:** Windows tray, Windows install/uninstall/self-restart, the
  signed `.pkg`; installers are unsigned until Apple/Authenticode certificates exist.
