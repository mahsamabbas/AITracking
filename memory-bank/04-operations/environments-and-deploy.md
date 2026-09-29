# Environments and deployment

## Production (as of 2026-09-30)
| Piece | Where |
|-------|-------|
| Web | Vercel team `techlio1`, project `ai-tracking-bhgg` → https://techlio-pulse.vercel.app (also ai-tracking-bhgg.vercel.app) |
| API | Vercel team `techlio1`, project `ai-tracking`, region `hnd1` → https://techlio-pulse-api.vercel.app (also ai-tracking-techlio1.vercel.app, ai-tracking-ten.vercel.app) |
| DB | Supabase project `whlmchiekayvngycjqqk`, `ap-northeast-1` (Tokyo); pooler :6543 runtime, :5432 migrations; all 17 migrations applied |
| Storage | Supabase Storage bucket `activity-archive` (private, created on first use) |
| Cron | Vercel Cron `30 21 * * *` → `GET /v1/maintenance/retention` |
| Deploy | Push to `main` on GitHub `mahsamabbas/AITracking` → both projects auto-deploy. API build: `pnpm --filter "@techlio/api..." build && node scripts/migrate.mjs --on-deploy` (migrations only when `VERCEL_ENV=production`) |

Only the tracking app's projects may be public; do not touch other projects in the team.
Do **not** deploy to mahsam's personal Vercel account.

## Environment variables (names only)
- API: `TECHLIO_DATABASE_URL` (wins over integration-injected `DATABASE_URL`), `DATABASE_URL`,
  `DATABASE_URL_UNPOOLED`, `JWT_SECRET`, `CRON_SECRET`, `DASHBOARD_ORIGINS`, `ORG_TIMEZONE`,
  `SKIP_REDIS=1`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`; optional `ARCHIVE_*`,
  `RETENTION_BUDGET_MS`, `RAW_/SESSION_/AUDIT_/EXPORT_RETENTION_DAYS`.
- Web: `NEXT_PUBLIC_API_URL`; optional `NEXT_PUBLIC_SHOW_DEMO_LOGINS`, `NEXT_DIST_DIR`.
- Worker: `REDIS_*`, `CURSOR_API_KEY`, `GITHUB_TOKEN`/`GITHUB_COPILOT_TOKEN`, `GITHUB_ORG`, `TECHLIO_PULL_ORG_ID`.
- Connector: `TECHLIO_API_URL`, `TECHLIO_DASHBOARD_ORIGINS`, `CONNECTOR_PORT`, `TECHLIO_CONSENT_VERSION`.
- Push Supabase URLs: `bash scripts/push-supabase-vercel-env.sh` (from `.vercel-api`), then redeploy
  `vercel redeploy https://ai-tracking-techlio1.vercel.app --scope techlio1`.

## Preview / staging
Vercel previews exist per branch but share no separate database and never migrate. No staging DB.

## Local
```bash
docker compose up -d postgres            # container techliotrackingapp-postgres-1
pnpm install && pnpm db:migrate && pnpm db:seed
pnpm --filter @techlio/api dev           # :3001, TECHLIO_DEV_MODE=1, seeds demo users
pnpm --filter @techlio/web dev           # :3000
```
`.claude/launch.json` has `api`, `web`, `web-audit` (dist `.next-dev`), `web-pwa`.
Local API with no DB env uses `postgres://techlio:techlio@localhost:5432/techlio_activity`.
Demo logins come from `DEMO_USERS` in `server-core/src/users.ts` (local only).
