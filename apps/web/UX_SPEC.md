# Techlio web — UX spec, tokens, and changelog

Operations console for managers, mirror for developers. Dense when needed,
never deceptive. Every number answers "where did this come from?".

## 1. Rules that override taste

1. **Unavailable ≠ zero.** A metric the provider does not report shows "Not
   available from provider" / "Not reported by provider", never `0`.
2. **Provenance on every analytics page.** The `ContextBar` states subject,
   range, timezone, and *Data as of …*, with a manual refresh and a Live pill
   when the page polls `/v1/dashboard/live`.
3. **No people scoring.** KPI deltas use ↑ / ↓ / → with neutral ink — a drop in
   AI usage is not painted red. No leaderboards; sorting is a user action.
4. **The agent performed…**, never "the developer worked…".
5. **No browser math.** Pages format, sort, and filter UI state only. Totals
   come from the API (`summary`, `matched`, `totals`).
6. **Distinct empty states** (`components/ui/States.tsx`): no activity, no
   results, connector offline, collection paused, provider missing, events
   delayed, no task selected, no employees, no permission.

## 2. Tokens (`src/app/globals.css`, documented inline)

| Group | Tokens | Use |
|-------|--------|-----|
| Colour | `--color-canvas/card/line/ink-*/brand-*` | Tailwind `bg-card`, `text-ink-500`… Dark mode redefines under `html.dark` |
| Connector state | `--state-ok/warn/bad/idle` → `bg-conn-ok` … | online · stale/paused · offline · idle; mirrors `CONNECTOR_STATE` in `lib/vocab.ts` |
| Charts | `--chart-1…6`, `--chart-idle/grid/axis` | Always paired with a legend label |
| Motion | `--motion-fast` 150ms · `--motion-normal` 250ms · `--motion-slow` 400ms, `--ease-out` | Tailwind `duration-fast/normal/slow`, `ease-out-soft` |
| Elevation | `--shadow-1/2/3` → `shadow-card/pop/modal` | resting · hover/popover · drawer/modal |
| Focus | `--focus-ring` | 2px outline on every `:focus-visible` (was removed entirely before) |

## 3. Motion

All motion collapses to instant under `prefers-reduced-motion: reduce` (CSS
variables go to 0ms, and a global override clamps animations/transitions).

| Where | Motion | Utility |
|-------|--------|---------|
| Route change | 400ms fade + 8px rise on main content only (keyed by path) | `.enter` |
| Sibling cards | opacity stagger, 40ms, max 5 | `.stagger` + `--i` |
| Mobile drawer | 250ms slide + backdrop fade | `.drawer-in`, `.backdrop-in` |
| Online connector dot | soft halo, the only looping animation | `.pulse-online` |
| Charts | draw once on mount (400ms); `isAnimationActive=false` under reduced motion | `useChartAnimation()` |
| Buttons, cards, rows | 150ms colour/shadow | `duration-fast` |
| Section expand, data swap | 250ms opacity | `.crossfade` |

Forbidden: parallax, bouncing loaders, confetti, animated counters on people.

## 4. Routes (markdown wireframes)

### `/` Command center
```
[PageHeader: Organisation overview ............ Export CSV · Export PDF · Directory]
[ContextBar: Organisation · 7 days · Times in UTC ........ ● Live · Data as of 1m ⟳]
[Filters (sticky ≥lg): range presets | dates | team | AI tool]
[KPI ×4: AI active ↑11% | Sessions ↑14% | Employees w/ activity | Coverage warnings]
[Usage trend (2/3) ................................][Observed time split (1/3)]
[AI tools in use][Session activity mix][Working-hour pattern]
[Teams][Tool categories][Engineering outcomes]
[Latest sessions (24h) ............................][Coverage & connector health]
[Connectors table]
```
Empty org: "No employees yet" / "Connector offline" — never sample data.

### `/employees` Directory (workbench)
```
[ContextBar]
[Search][range][team][tool][All|Online|Stale|Paused|Offline] ........ [Sort]
[KPI ×4 from API summary]
[Table: Employee↓ · Connector ● · Tools · AI active ↓ · Productive · Sessions · Avg · Trend · Last active · This hour]
```
Sortable headers expose `aria-sort`. Rows open the employee hub.

### `/employees/[id]` Employee hub (story, top to bottom)
1. Identity + connector status (pulse when online; callout when stale/paused/offline)
2. KPIs with period comparison
3. Daily trend + five-duration split
4. AI tools used (drill into a tool)
5. Projects & file changes
6. AI subscription usage (provider units, admin-set limits only)
7. Hourly timeline → `/hourly/[id]`
8. Recent sessions → session detail
9. Patterns, breakdowns, idle & coverage periods (detail)

### `/employees/[id]/tools/[provider]`, `/employees/[id]/sessions`, `/sessions/[id]`
Breadcrumbs always visible. Tool page shows the provider capability callout
first. Session detail keeps the five durations separate (`DurationSplit`) and
filters the event timeline by activity type.

### `/setup-connector`, `/my-connectors`
Stepper: install → admin key → activate. After activation,
`FirstActivityStatus` shows *Connected — waiting for your first agent event*,
then *Receiving activity · last event 20s ago → See your activity* — driven only
by `/v1/dashboard/live`.

### Admin: `/users`, `/connectors`, `/audit`, `/policy`
Same shell and table density. Audit is read-only.

## 5. Build phases

| Phase | Scope | State |
|-------|-------|-------|
| A | Tokens, motion utilities, reduced-motion, focus ring, `PageHeader`, `Section`, `ContextBar`, skip link, drawer, chart animation gating | Done |
| B | Overview + directory: context bar, neutral deltas, connector pills, sortable headers, opaque sticky table headers, sticky filters (≥lg) | Done |
| C | Employee hub narrative order, no-permission state, session history context bar | Done |
| D | First-activity onboarding state, empty-state copy | Done; install stepper polish and OS-specific download emphasis remain |

Not done yet (next PRs): virtualising the directory beyond 50 rows (it
paginates server-side sorting but renders all rows), virtualising very long
session timelines, toast component for success notices, automated axe checks
in CI, and a Playwright visual-regression suite (light/dark × 1280/390 ×
manager/developer/auditor).

## 6. UX changelog (2026-09-23)

- **Provenance:** every analytics page opens with a context bar — subject,
  range, org timezone, *Data as of*, manual refresh, Live pill.
- **Neutral comparisons:** KPI deltas are arrows + neutral ink; no red for "down".
- **Keyboard:** visible focus ring restored app-wide; skip-to-content link;
  `main` landmark target; sortable headers announce `aria-sort`; alert lists
  are `aria-live="polite"`.
- **Motion:** route-level fade-in of content, animated drawer, online pulse,
  one-time chart draw — all instant under reduced motion.
- **Directory:** connector filter as pills; clickable sort headers with an
  arrow on the active column; totals come from the API.
- **Employee hub:** sections reordered into a narrative (trend → tools →
  projects → subscription usage → hourly → sessions).
- **Truthful states:** new *No employees yet* and *Outside your access*
  variants; *No activity* copy no longer claims Cursor activity only arrives via
  companion saves; AI subscription card says *Not reported by provider · N
  sessions observed* instead of *No activity* when sessions exist.
- **Onboarding:** after activation, a live status explains that the connector
  is waiting for the first agent event, then confirms it.
- **Login:** empty fields; demo accounts appear only in local dev builds.
- **Fixes:** opaque sticky table headers; filters no longer cover the screen
  on phones.

Before/after: screenshots were captured during the session at 1280px dark and
390px light for the overview and directory. The repo has no screenshot
tooling yet; the Playwright suite above is the durable replacement.
