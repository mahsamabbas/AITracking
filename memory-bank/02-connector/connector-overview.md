# Connector

`apps/connector` — one per OS user, runs in the background, never a foreground window.

## Runtime
- Fastify on `127.0.0.1`, port 9477–9486 picked per OS user and recorded in
  `~/.techlio-connector/port` (hooks, OTLP endpoint, tray and dashboard all read it).
- Local API: `/health`, `/identity`, `/claim` (pairing), `/pause`, `/resume`, `/stop`, `/unpair`,
  `/host` (companion declares the editor), `/hooks/agent`, `/hooks/claude`, `/hooks/extension`,
  `/hooks/ci-gate`, `/hooks/git-commit`, `/v1/logs` (Claude Code OTLP). Only trusted dashboard
  origins may call it (`DASHBOARD_ORIGINS` via `GET /v1/connectors/config`); Chrome's Local
  Network Access permission applies.
- Queue: AES-256-GCM encrypted JSON file, flushed every 15 s (`uploader.ts`, 30 s timeout).
  Heartbeat every 30 s (15 s timeout); reply `remotePaused` pauses collection (never lifts a local pause).
- Secrets (`device-token`, `signing-key`, `queue-key`): macOS Keychain, Windows DPAPI, Linux
  Secret Service (`secret-tool`), else a 0600 file.
- Git watcher (`git-watch.ts`): commits by the local git user in repos the agents work in → counts only.
- Housekeeping: stale in-memory maps pruned every 15 s; "not a repo" cache expires after 10 min.

## Modes of the single binary (`launcher.ts`)
`<exe>` (no args) install + start service and exit · `--service` run · `--hook <provider> [event]`
hook runner (reads stdin, `normalizeHookPayload`, posts to `/hooks/agent`) · `--status` ·
`--uninstall [--purge]` · `--tray` (Windows).

## Service per OS (`install-service.ts`)
| OS | Install location | Start at sign-in | Status UI |
|----|------------------|------------------|-----------|
| macOS | `.pkg` → `/Library/Application Support/Techlio/Connector` | `/Library/LaunchAgents/com.techlio.connector.plist` | Swift menu-bar app |
| Windows | `%USERPROFILE%\.techlio\connector` | hidden logon task (Run-key fallback), self-supervising | PowerShell/WinForms tray |
| Linux | `~/.techlio/connector` | systemd user unit `techlio-connector.service`; **fallback** `~/.config/autostart/techlio-connector.desktop` + detached start (WSL/containers) | none — pause from the dashboard; `--status`; desktop dialog via zenity/notify-send when launched from a file manager |

Uninstall removes the service, every hook the connector installed (user entries kept), the
IDE companion, and optionally credentials/data (`--purge`).

## Pairing / setup phases (web)
`offline` → `unpaired` → `ready` (`apps/web/src/lib/connector-setup.ts`). `installedHere` tracks
whether a connector answers on this computer (drives the Install agent tab).

See: [ai-tool-integrations.md](ai-tool-integrations.md) · [installers-and-release.md](installers-and-release.md)
