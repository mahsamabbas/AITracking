#!/usr/bin/env bash
# Bootstrap Access users + connector credential on production Postgres.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

EXPORTED_URL="${DATABASE_URL:-${POSTGRES_URL:-}}"
if [[ -n "$EXPORTED_URL" && "$EXPORTED_URL" != *SENSITIVE* && "$EXPORTED_URL" == postgres* ]]; then
  echo "==> Using DATABASE_URL from your shell"
  export DATABASE_URL="$EXPORTED_URL"
else
  echo "==> Resolving production Postgres URL (apps/api/.env.production.local or Vercel env)"
  export DATABASE_URL
  export DATABASE_URL_UNPOOLED
  DATABASE_URL_UNPOOLED="$(node "$ROOT/scripts/migrate.mjs" --production --print-dsn)"
  if [[ -z "$DATABASE_URL_UNPOOLED" ]]; then
    echo "ERROR: Could not resolve production DATABASE_URL_UNPOOLED."
    exit 1
  fi
  export DATABASE_URL="$DATABASE_URL_UNPOOLED"
fi

cd "$ROOT"
pnpm --filter @techlio/server-core run build
exec pnpm --filter @techlio/api exec tsx src/scripts/bootstrap-prod-access.ts
