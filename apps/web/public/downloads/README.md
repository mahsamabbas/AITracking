# Connector downloads

Employees download a connector program from the dashboard. They do not clone this
repo, install Node.js, or run `pnpm`.

Maintainers: from repo root run:

```bash
pnpm connector:pack
```

Then deploy the web app so these files are served:

- `/downloads/techlio-connector-win-x64.exe` — open once; installs a hidden
  background task and exits (no console window)
- `/downloads/techlio-connector-macos.pkg` (Intel and Apple silicon) — installs a
  LaunchAgent; nothing in Applications or the Dock
- `/downloads/techlio-connector-macos-arm64.pkg`
- `/downloads/techlio-connector-macos-x64.pkg`
