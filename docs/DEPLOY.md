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
| `ORG_TIMEZONE` | e.g. `Asia/Karachi` (PKT) — hour labels only; storage stays UTC |

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
6. **Employee installs the connector** from **Install agent** in the dashboard.
   It is a background service, not an app — no window, Dock icon, or taskbar
   button — and starts at every sign-in. No terminal, Node, or repository needed.
   - **macOS** — `techlio-connector-macos.pkg` (asks for an admin password once;
     MDM can push it silently). Installs to
     `/Library/Application Support/Techlio/Connector/` plus the LaunchAgent
     `/Library/LaunchAgents/com.techlio.connector.plist`, which runs one instance
     per signed-in user and restarts it after a crash. A menu-bar icon
     (`com.techlio.connector.menubar`, no Dock icon) shows Running / Paused /
     Not activated / Not running, with Pause, Resume, Show log, and Restart.
     Hiding the icon never stops collection. Remove with
     `sudo "/Library/Application Support/Techlio/Connector/uninstall.sh" [--purge]`.
   - **Windows** — `techlio-connector-win-x64.exe`, opened once. It copies itself
     to `%USERPROFILE%\.techlio\connector\`, registers the hidden logon task
     `TechlioConnector` (HKCU Run key if Task Scheduler is blocked), starts it,
     shows a confirmation, and exits. The service supervises itself — it
     restarts its worker 10 s after any crash — because Task Scheduler only
     retries a task that fails to launch. The executable is
     GUI-subsystem, so no console opens. A tray icon next to the clock (task
     `TechlioConnectorTray`, a hidden PowerShell/WinForms icon — no extra
     runtime) shows the state and offers Pause/Resume, Stop/Start connector,
     Open dashboard, and Show log. Remove from **Settings → Apps**.
   - **Stopping (both platforms):** "Stop connector…" asks for confirmation,
     records a *stopped by employee* coverage gap (shown on the Workday card,
     never counted as idle), flushes queued events, and exits cleanly so the OS
     does not restart it. It stays off until the employee clicks Start or signs
     in again. Deploy the API before the new connector: `gap_reason: "stopped"`
     is new in the event schema.
   - Logs: `~/.techlio-connector/connector.log`. Health: `techlio-connector --status`.
   - **One connector per OS user.** Each user signed in to a computer gets their
     own port in 9477–9486, recorded in `~/.techlio-connector/port`. Hooks, the
     Claude Code telemetry endpoint, the menu-bar app, and the IDE companion read
     that file, and the dashboard only talks to a connector paired to the signed-in
     person (or not yet activated). Two profiles on one machine never share data.
   - If this same user's other connector owns the port (e.g. `pnpm dev`), the
     service retries every ~40 s and takes over when that one stops.
   - **Dashboard says "not detected" while the connector runs:** Chrome/Edge
     142+ ask before a website may reach apps on this device. The employee must
     choose **Allow** (or set *Local network access* → Allow in the site
     settings); ad blockers such as Brave Shields also block it. The install
     page detects a denied permission and says so.
   - Why per-user and not a SYSTEM/root service: the AI tools, their hook
     configs, and the credential store (Keychain, DPAPI) belong to the
     signed-in user.
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

## Organisations (multi-tenant)

The platform super admin creates organisations; each organisation's admins
manage their own people under **Access**. Bootstrap once (use an email that is
not an organisation account):

```bash
# Local Docker Postgres only — not Vercel/Neon:
pnpm admin:create --super --email platform@yourcompany.com

# Production (same database as pnpm db:migrate:prod):
pnpm admin:create:prod --super --email platform@yourcompany.com --name "Platform Admin"
```

Sign in with it → **Organizations** → *New organization* (name, timezone, first
administrator). The administrator's password is shown once. *Disable* blocks
sign-in and connector uploads for that organisation without deleting data. The
super admin cannot see any organisation's activity.

## Removing the seeded demo people

If `pnpm db:seed` ever ran against a database, the demo employees
(`@techlio.local` emails — Alex Rivera, Sam Okafor, Mei Tanaka, …) and their
~200k synthetic events appear next to real people. Remove them (real people are
never touched; the dry run lists exactly what goes and what stays):

```bash
read -rs DATABASE_URL && export DATABASE_URL
node scripts/purge-demo-data.mjs --production            # dry run
node scripts/purge-demo-data.mjs --production --confirm  # delete
```

## Upgrading an existing deployment to this release

Migration `008_disable_default_credentials` disables every account still using
a published demo password. **Run `pnpm admin:create` first** or you will lock
yourself out. See `docs/PRODUCTION_TRUTH_AUDIT.md` §5 for the full checklist
(credential rotation, audit-log review, removing any seeded demo data).

## Connector installers

`pnpm connector:pack` builds the macOS installer packages (`.pkg`, universal and
per-architecture), the Windows executable, the companion
VSIX, and `SHA256SUMS.txt` into `apps/web/public/downloads/`. Local builds are
ad-hoc signed and **will be blocked by Gatekeeper/SmartScreen** when downloaded.
Distribution builds:

```bash
APPLE_SIGNING_IDENTITY="Developer ID Application: Techlio (TEAMID)" \
APPLE_INSTALLER_IDENTITY="Developer ID Installer: Techlio (TEAMID)" \
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
