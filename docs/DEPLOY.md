# Deploying Techlio

Production is an **empty organisation** until real people, devices, and events
exist. Nothing is seeded, no demo account exists, and every number on the
dashboard comes from a connector heartbeat, a signed event batch, or a worker
pull. If the dashboard is empty, that is the truth — do not seed it.

## Architecture

| Piece | Where | Notes |
|-------|-------|-------|
| Web (`apps/web`) | Vercel | Next.js. Needs `NEXT_PUBLIC_API_URL` |
| API (`apps/api`) | Vercel (NestJS) or Render (Docker, `render.yaml`) | Needs `DATABASE_URL`, `JWT_SECRET` |
| Postgres | Neon (via Vercel) or Render | Migrations are run by you, not on boot |
| Redis + worker (`apps/worker`) | Any Node host | Hourly finalisation, retention, Tier B pulls. Without it the API recalculates late hours inline but **no hour is finalised on schedule** |
| Connector | Each employee's machine | Installed from the dashboard download; runs as a per-user service |

## Required environment

**API** — the API refuses to start if these are wrong:

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | Production Postgres URL |
| `JWT_SECRET` | `openssl rand -hex 32` (≥ 32 chars, not a placeholder) |
| `NODE_ENV` | `production` |
| `SKIP_REDIS` | `1` only if there is no Redis/worker (late events then recalculate inline) |
| `ORG_TIMEZONE` | e.g. `Europe/London` — hour labels only; storage stays UTC |

Never set `TECHLIO_DEV_MODE` on a hosted runtime — the API refuses to boot with
it. `ALLOW_DEV_HEADER_AUTH` no longer exists; remove it if present.

**Worker** — `DATABASE_URL`, `REDIS_URL`, and optionally `CURSOR_API_KEY`,
`GITHUB_TOKEN` + `GITHUB_ORG`, `TECHLIO_PULL_ORG_ID` (required only if the
database holds more than one organisation), `RETENTION_DAYS`.

**Web** — `NEXT_PUBLIC_API_URL=https://<api-host>` (no trailing slash). Do not
set `NEXT_PUBLIC_SHOW_DEMO_LOGINS` outside local development.

## Greenfield organisation — live dashboard in about 15 minutes

1. **Deploy** the API and web with the environment above.
   `curl -s https://<api>/v1/health` → `{"ok":true,…,"schema":{"upToDate":true}}`.
   `schema.upToDate: false` means the code is newer than the database — run step 2.
   Until then, affected routes answer **503 `schema_out_of_date`** instead of a bare 500.
2. **Migrate** (from a trusted machine, production credentials in
   `apps/api/.env.production.local`):
   ```bash
   pnpm db:migrate:prod
   ```
   Plain `pnpm db:migrate` only ever targets local Postgres.
3. **Create the first administrator** — this is the only bootstrap credential:
   ```bash
   DATABASE_URL='<production url>' pnpm admin:create --email you@company.com --name "Your Name"
   ```
   The generated password is printed once. Sign in at `https://<web>/login`.
4. **Add people** under **Access**: managers, auditors, and one developer
   account per monitored employee (use their work email — Cursor usage is
   matched on it).
5. **Issue a connector credential** per employee and AI tool (Access /
   Connectors → register). Hand the device ID and token to the employee.
6. **Employee installs the connector** from **Install agent** in the dashboard
   (DMG on macOS, `.exe` on Windows). It installs itself as a background
   service and starts at sign-in. No terminal, Node, or repository needed.
7. **Employee activates** on **My connectors**: paste the credential, read and
   accept the collection notice. Activation binds the connector's signing key.
8. **Verify** within a minute:
   - The employee's connector shows **Online** on Connectors.
   - After one prompt in Claude Code or Cursor, a session appears on the
     employee's page and in *Latest sessions* on the overview.
   - Pausing from *My connectors* shows **Paused** plus a coverage-gap notice;
     resuming closes the gap.
9. **Optional Tier B** — set `CURSOR_API_KEY` / `GITHUB_TOKEN` on the worker.
   Copilot logins must be mapped to employees in
   `employee_provider_identities`; unmapped rows are skipped and counted in the
   worker log, never assigned to someone else.

## Upgrading an existing deployment to this release

Migration `008_disable_default_credentials` disables every account still using
a published demo password. **Run `pnpm admin:create` first** or you will lock
yourself out. See `docs/PRODUCTION_TRUTH_AUDIT.md` §5 for the full checklist
(credential rotation, audit-log review, removing any seeded demo data).

## Connector installers

`pnpm connector:pack` builds macOS DMGs, the Windows executable, the companion
VSIX, and `SHA256SUMS.txt` into `apps/web/public/downloads/`. Local builds are
ad-hoc signed and **will be blocked by Gatekeeper/SmartScreen** when downloaded.
Distribution builds:

```bash
APPLE_SIGNING_IDENTITY="Developer ID Application: Techlio (TEAMID)" \
APPLE_NOTARY_PROFILE=techlio-notary \
WINDOWS_CERT_PFX=/secure/techlio.pfx WINDOWS_CERT_PASSWORD=… \
pnpm connector:pack --release
```

`--release` refuses to produce unsigned installers.

## Local development

```bash
docker compose up -d postgres redis
pnpm db:migrate
pnpm db:seed         # local demo data; refuses any non-local database
pnpm dev             # API in dev mode (demo logins enabled), web, connector
```

`apps/web/.env.development.local` sets `NEXT_PUBLIC_SHOW_DEMO_LOGINS=1` so the
sign-in page lists the local demo accounts.
