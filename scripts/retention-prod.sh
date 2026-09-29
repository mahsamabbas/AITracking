#!/usr/bin/env bash
# Run data maintenance against production now (same job as the nightly cron).
# Archive storage credentials come from apps/api/.env.supabase.local
# (SUPABASE_URL + SUPABASE_SECRET_KEY) — never printed.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

DATABASE_URL_UNPOOLED="$(node "$ROOT/scripts/migrate.mjs" --production --print-dsn)"
if [[ -z "$DATABASE_URL_UNPOOLED" ]]; then
  echo "ERROR: Could not resolve the production database URL. See scripts/migrate-prod.sh"
  exit 1
fi
export DATABASE_URL="$DATABASE_URL_UNPOOLED"

SUPA="$ROOT/apps/api/.env.supabase.local"
for key in SUPABASE_URL SUPABASE_SECRET_KEY SUPABASE_SERVICE_ROLE_KEY ARCHIVE_BUCKET RAW_RETENTION_DAYS SESSION_RETENTION_DAYS; do
  if [[ -z "${!key:-}" && -f "$SUPA" ]]; then
    value="$(grep -E "^${key}=" "$SUPA" | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')"
    [[ -n "$value" ]] && export "$key=$value"
  fi
done

cd "$ROOT"
pnpm --filter @techlio/server-core run build >/dev/null
exec pnpm --filter @techlio/api exec tsx src/scripts/retention.ts "$@"
