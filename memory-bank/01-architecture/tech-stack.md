# Tech context

- **Monorepo:** pnpm + Turborepo, TypeScript
- **Connector:** per-user background service (localhost, port 9477–9486 chosen per
  OS user, recorded in `~/.techlio-connector/port`). Employees download
  a Windows `.exe` (GUI-subsystem, registers a hidden logon task) or a macOS
  `.pkg` (universal; installs a LaunchAgent, no app bundle)
  from the dashboard — they do not run `pnpm` or clone this repo. Status icon: Swift
  menu-bar app (macOS) / PowerShell tray (Windows) with pause, stop/start. Encrypted file
  queue, Ed25519 signing, Claude hooks + IDE companion.
- **API:** NestJS + Fastify, `@techlio/server-core` + Postgres + Drizzle
- **Worker:** BullMQ + Redis, hourly finalize at :05 UTC
- **Web:** Next.js 15 App Router, Tailwind, Recharts. All metrics come from the
  API — nothing is aggregated in the browser.
- **Migrations:** `infra/sql/*.sql` applied by `scripts/migrate.mjs`, tracked in
  `schema_migrations`.
- **Demo data:** `packages/server-core/src/seed.ts`, deterministic, run with
  `pnpm db:seed`.
- **Tier A implemented:** Claude Code hooks. Codex and Gemini are planned adapters
  only; their OTLP routes reject with 501 until normalization exists.
- **Tier B** (daily aggregates only): GitHub Copilot reports. VS Code companion
  contributes file and task-context signals only.
- **Cursor live hooks:** the connector installs Cursor agent hooks
  (`~/.cursor/hooks.json`) and Claude Code hooks (`~/.claude/settings.json`) on
  startup, so Cursor now reports prompt/tool/file activity with timing (no token
  totals). Cursor also runs the Claude-format hooks; the connector suppresses that
  cross-provider echo so a Cursor action is never double-counted as Claude. The
  running app is identified by its own environment (`CURSOR_*` vs `CLAUDECODE`),
  and hooks forward allowlisted fields only — never prompts, tool input, command
  text, or file contents.
