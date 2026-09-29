# Web app (`apps/web`)

## Structure
- Next.js 15 App Router; every page is `"use client"` — the server renders the shell, data is
  fetched in the browser with the JWT.
- Providers (`app/layout.tsx`): ThemeProvider → PwaProvider → AuthProvider →
  DisplayTimezoneProvider → ConnectorRequiredGate (+ ConnectorOnboardingTour). Inline boot script
  applies theme + display preferences before first paint (`lib/preferences-boot.ts`).
- Shell: `components/AppShell.tsx` — role-filtered sidebar, sticky glass header (timezone,
  install, theme), mobile drawer, `PlatformOrgTabBar`.
- Folders: `components/ui` (primitives), `components/charts`, `components/domain` (widgets),
  `components/filters`, `components/settings`, `components/onboarding`, `lib/*` (api, hooks, vocab).

## Data
- `lib/api.ts`: `apiGet/apiPost/apiPatch/apiDownload`, headers `x-techlio-display-timezone`,
  `x-techlio-org-id`. `apiDisplayTimezone()` is the formatter default.
- `lib/use-api.ts` `useApi(path, { pollMs })`: AbortController, keeps data while refreshing,
  polls only while the tab is visible, refreshes on return, refetches on timezone change,
  honours the *Live updates* preference.
- `lib/live-poll.ts`: `analyticsPollMs(range)` = 30 s only when the range includes today;
  `LIVE_POLL_MS` 30 s.
- Local connector: `lib/connector-local.ts` + `lib/connector-setup.ts` — one coalesced poller,
  2.5 s freshness, 10 s failed-scan memo, paused while hidden. `detectConnectorPlatform()` →
  mac | windows | linux | other; `linuxInstallCommand()`.
- Links inside a super-admin workspace: `OrgLink` / `useAppPaths().resolvePath` (prefix
  `/platform/[orgId]`).
- Formatting: `lib/format.ts` (display timezone default, 12/24 h preference, day keys in UTC).
- Provider display: `lib/providers.ts` (labels, colours, notes, `ASSIGNABLE_AI_TOOLS`).

## Settings → Appearance (per browser, `localStorage` `techlio-prefs`, `lib/preferences.ts`)
Theme (light/dark/system, `techlio-theme`), accent (indigo/violet/blue/teal/rose), density
(comfortable/compact), reduce motion, display timezone, clock (auto/12h/24h), default date range,
live updates. Applied as `html[data-accent|data-density|data-motion]`. Nothing here changes data.

See [ui-design-system.md](ui-design-system.md) for tokens, charts and responsive rules.
