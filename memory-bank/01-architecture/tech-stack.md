# Tech stack

| Layer | Technology |
|-------|-----------|
| Monorepo | pnpm workspaces + Turborepo, TypeScript 5, Vitest (+ fast-check), ESLint (`next lint`), Husky pre-commit (lint + tests) |
| Web | Next.js 15 App Router (all pages client components), React 19, Tailwind 3 with CSS-variable tokens, Recharts, Formik + Yup, PWA (`public/sw.js`, manifest), Inter |
| API | NestJS 10 on Fastify 4, `jsonwebtoken` (HS256, 12 h), `@noble/ed25519` batch signatures |
| Data | PostgreSQL via `pg` pool; Drizzle ORM for tables + raw SQL (`db.execute(sql\`…\`)`) for analytics |
| Database | Production: Supabase Postgres, Tokyo `ap-northeast-1` (pooler :6543 runtime, :5432 migrations). Local: Docker `postgres:16` |
| Object storage | Supabase Storage private bucket `activity-archive` (retention archives); `ARCHIVE_DIR` local fallback |
| Queue (optional) | Redis + BullMQ in `apps/worker` — not deployed; production `SKIP_REDIS=1` |
| Hosting | Vercel team `techlio1`: `ai-tracking` (API, region `hnd1`, cron) and `ai-tracking-bhgg` (web). Git auto-deploy from `main`. Alternatives in repo: Dockerfiles, `render.yaml`, `docker-compose.yml` |
| Connector | Node/TypeScript + Fastify on `127.0.0.1:9477–9486` (per OS user, recorded in `~/.techlio-connector/port`), compiled with Bun into single binaries: macOS `.pkg` (universal, LaunchAgent + Swift menu-bar app), Windows `.exe` (GUI subsystem, logon task + PowerShell tray), Linux `.tar.gz` x64/arm64 (systemd user service, XDG autostart fallback). AES-256-GCM queue; secrets in Keychain / DPAPI / Secret Service / 0600 file |
| IDE companion | VS Code-family extension `techlio-activity-companion` (`.vsix`), installed via `cursor`, `code`, `windsurf`, `antigravity` CLIs |
| AI / ML | None called. The product **observes** AI coding tools; it runs no models |
| Third-party APIs | Cursor Admin API, GitHub Copilot metrics API (optional Tier B, worker) |

## Tracked AI tools (catalogue `packages/event-schema/src/providers.ts`)

| Provider id | Label | Tier | How | Details |
|-------------|-------|------|-----|---------|
| `claude_code` | Claude Code | A | Hooks `~/.claude/settings.json` + OTLP logs (tokens) | [../02-connector/ai-tool-integrations.md](../02-connector/ai-tool-integrations.md) |
| `cursor` | Cursor | A | Hooks `~/.cursor/hooks.json` | 〃 |
| `github_copilot` | GitHub Copilot | A (+B) | Hooks `~/.copilot/hooks/techlio-connector.json` (CLI + VS Code agent mode); org daily reports | 〃 |
| `windsurf` | Windsurf (Devin Desktop) | A | Cascade hooks `~/.codeium/windsurf/hooks.json` | 〃 |
| `antigravity` | Google Antigravity | A | Hooks `~/.gemini/config/hooks.json` | 〃 |
| `gemini` | Gemini CLI | A | Hooks in `~/.gemini/settings.json` | 〃 |
| `codex` | Codex CLI | A | Hooks `~/.codex/hooks.json` (trust once via `/hooks`) | 〃 |
| `devin` | Devin CLI | A | Reads the Claude-format hooks; detected by `prompt_id` | 〃 |
| `vscode` | VS Code companion | B | Extension: host + task context only | 〃 |
