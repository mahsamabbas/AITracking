#!/usr/bin/env bash
# Create or reset an administrator against production Postgres (same URL as db:migrate:prod).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

EXPORTED_URL="${DATABASE_URL:-${POSTGRES_URL:-}}"
if [[ -n "$EXPORTED_URL" && "$EXPORTED_URL" != *SENSITIVE* && "$EXPORTED_URL" == postgres* ]]; then
  echo "==> Using DATABASE_URL from your shell"
  export DATABASE_URL="$EXPORTED_URL"
else
  echo "==> Resolving production Postgres URL (apps/api/.env.production.local or Vercel env)"
  export DATABASE_URL
  DATABASE_URL="$(node "$ROOT/scripts/migrate.mjs" --production --print-dsn)"
  if [[ -z "$DATABASE_URL" ]]; then
    echo "ERROR: Could not resolve production DATABASE_URL. See scripts/migrate-prod.sh"
    exit 1
  fi
fi

cd "$ROOT"
exec pnpm admin:create "$@"
