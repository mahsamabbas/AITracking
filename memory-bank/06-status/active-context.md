# Active context

**As of 2026-09-30.** Rewrite this file (don't append) when the picture changes; history goes to
[progress-log.md](progress-log.md).

## Production
- Live at https://techlio-pulse.vercel.app / https://techlio-pulse-api.vercel.app (Vercel team
  `techlio1`), Supabase Tokyo project `whlmchiekayvngycjqqk`, **17/17 migrations applied**, API
  health ok. Deployed commits: `b7d9159` (full audit) and `498cc29` (install tab when no local
  connector) on 2026-09-29.
- DB size ~15 MB. First nightly retention run due 2026-09-30 21:30 UTC — verify `maintenance_runs`.

## In the working tree, NOT yet committed/deployed
1. **UI revamp** — design refresh, Settings → Appearance (theme, accent, density, motion, clock,
   default range, live updates), charts fill their cards, mobile sideways chart scroll,
   `.grid > *` min-width fix, profile card redesign, Workday stat tiles, two-up stat tiles on phones.
2. **More AI tools** — hooks for Windsurf/Devin Desktop, GitHub Copilot (CLI + VS Code agent),
   Gemini CLI, Codex CLI; Devin CLI detected through the Claude hooks; shared
   `normalizeHookPayload`; catalogue + dropdowns list 9 tools; companion installs into Windsurf /
   Antigravity and maps their editor names.
3. **Linux connector** — x64/arm64 `.tar.gz`, `install-connector-linux.sh`, systemd user service
   with XDG autostart fallback, Linux tab on the setup page, rebuilt installers + checksums.
4. **Modularisation pass** — shared helpers, dead code removed, no behaviour change (see
   progress log).
5. **Docs** — `docs/Techlio-Pulse-Project-Documentation.pdf`; this memory bank restructured.

Tests: 15/15 turbo tasks, connector 24 tests (incl. end-to-end hook script), all workspaces
type-check, lint clean. Linux installer verified in an Ubuntu 24.04 container.

## Owner actions pending
- Rotate the Supabase DB password + secret key; update Vercel; redeploy.
- Commit + push the working tree (deploys) — then everyone reinstalls the connector.
- Codex users trust the new hook once (`/hooks`).
- Legal/HR sign-off on the monitoring notice before any pilot.

## Watch-outs for the next person
- The overview "Right now" panel ignores the team filter.
- GitHub Copilot: if a user enables `chat.useClaudeHooks` in VS Code, Copilot runs the Claude
  hooks too and would also be reported as Claude Code (off by default).
- Devin cloud sessions cannot be observed by a connector; only Devin CLI.
- Refactor audit findings left unchanged on purpose (behaviour decisions for the owner):
  breadcrumbs / NotFound / some `router.push` and links to `/settings`, `/users`, `/policy` drop
  the platform-org workspace; raw fetches in `auth-context.tsx` and `connector-setup.ts` skip the
  timezone/org headers; `scopeDeveloperIds` returns `[]` for a developer without a developerId
  (session queries then see the whole org, event-time queries nothing); connectors controller
  staleness differs from `connectorStateOf`; API Redis lacks `rediss` TLS handling;
  `progressTimeline` defaults to the UTC day; leaderboard ignores display timezone; session
  `clockHour` uses the server timezone; sessions/exports use `lte` on `to`; some controllers use
  `user.organizationId` and ignore the platform header.
