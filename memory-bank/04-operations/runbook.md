# Runbook

## Quality gates (run before every push)
```bash
pnpm --filter "@techlio/server-core..." build   # API/worker consume its dist
pnpm turbo run test                              # 15 tasks
pnpm --filter <workspace> run lint               # NOT `npx eslint` (pulls ESLint 10)
(cd apps/<ws> && npx tsc --noEmit -p .)
NEXT_DIST_DIR=.next-build npx next build         # in apps/web; revert next-env.d.ts afterwards
```
Husky pre-commit also runs lint + tests.

## Common tasks
| Task | Command |
|------|---------|
| Migrate local / prod | `pnpm db:migrate` / `pnpm db:migrate:prod` |
| Compare prod migrations | read-only query `schema_migrations` vs `infra/sql` (the `--check` flag only validates connection env) |
| Retention now | `pnpm db:retention` / `pnpm db:retention:prod` |
| Rebuild installers | `yes y \| pnpm connector:pack` (commit downloads + SHA256SUMS) |
| Create admin | `pnpm admin:create --email …` (`--super` for platform) |
| Purge demo people | `node scripts/purge-demo-data.mjs --production --keep a,b --confirm` |
| API health | `curl https://techlio-pulse-api.vercel.app/v1/health` (db, schema, source) |

## Troubleshooting
- **"Connector not detected" but running:** browser Local Network Access permission, ad-blocker,
  or a connector set up for another dashboard address — `LocalAccessHint` names which.
- **Linux connector:** `systemctl --user status techlio-connector`; no systemd → autostart entry
  `~/.config/autostart/techlio-connector.desktop`; `~/.techlio/connector/techlio-connector --status`;
  log `~/.techlio-connector/connector.log`.
- **Codex events missing:** run `/hooks` in Codex once and trust the Techlio hook.
- **Commits missing:** git watcher timeouts on repos with huge committed binaries; check
  `~/.techlio-connector/git-state.json` ownership (a `sudo` dev run once made it root-owned).
- **API 500 "schema out of date":** migration not applied → deploy API (migrates) or `db:migrate:prod`.

## Headless UI checks
Screenshot/overflow audits used headless Chrome over CDP (script kept outside the repo in the
session scratchpad): log in via `/v1/auth/login`, set `techlio-jwt`, capture pages at 390/768/1440.
