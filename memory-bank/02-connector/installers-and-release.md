# Installers and release

Built by `pnpm connector:pack` (`scripts/pack-connector.mjs`; answer `y` to prompts:
`yes y | pnpm connector:pack`). Needs Bun (cross-compiles every target) and, for macOS
`.pkg`/menu-bar, Xcode command line tools. Output → `apps/web/public/downloads/` (served by the
web app) + `SHA256SUMS.txt`. Build scratch in `downloads/build/` (git-ignored).

| File | Platform | Size (approx.) |
|------|----------|----------------|
| `techlio-connector-macos.pkg` (+ `-arm64/-x64.pkg`, raw binaries) | macOS universal | 51 MB pkg |
| `techlio-connector-win-x64.exe` | Windows x64 (GUI subsystem) | 96 MB — close to GitHub's 100 MB file limit |
| `techlio-connector-linux-x64.tar.gz`, `-linux-arm64.tar.gz` | Linux | 36 MB each (raw ~95 MB, so shipped compressed) |
| `techlio-companion.vsix` | VS Code-family editors | 4 KB |
| `/install-connector-linux.sh` (in `public/`) | Linux one-liner | — |

## Linux install
`curl -fsSL https://techlio-pulse.vercel.app/install-connector-linux.sh | TECHLIO_SITE=https://techlio-pulse.vercel.app sh`
— picks x64/arm64, downloads the archive + `SHA256SUMS.txt`, verifies the checksum, extracts,
runs the binary once (installs itself for the current user, no sudo). The setup page shows this
command (with the current site origin) under the Linux tab, plus direct archive links.
Verified 2026-09-30 in an `ubuntu:24.04` container: checksum ok, autostart fallback, `/health` on 9477.

## Rules
- Rebuild and commit the installers whenever `apps/connector` changes; users must reinstall.
- Packaged API/dashboard hosts are baked in at build time (`TECHLIO_API_URL`,
  `TECHLIO_DASHBOARD_ORIGINS`; defaults in `production-hosts.ts`).
- Unsigned (ad-hoc) builds today. `--release` requires Apple Developer ID + notarization and an
  Authenticode certificate and refuses to publish unsigned.
- Large binaries in git slow the connector's git watcher on this repo and trigger GitHub LFS
  warnings; moving installers to release assets is in the backlog.
