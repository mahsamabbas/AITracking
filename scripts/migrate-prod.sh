#!/usr/bin/env bash
# Run migrations against production Postgres using Vercel-injected env.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="$ROOT/apps/api"

corrupted_env() {
  local f="$1"
  [[ -f "$f" ]] && grep -q '\[SENSITIVE\]' "$f" 2>/dev/null
}

if corrupted_env "$API_DIR/.env.local" || corrupted_env "$API_DIR/.env.production.local"; then
  echo "ERROR: apps/api/.env.local (or .env.production.local) contains literal [SENSITIVE] placeholders."
  echo "       Cursor or an editor replaced real secrets — migrate cannot connect."
  echo ""
  echo "Fix (use macOS Terminal.app, not Cursor, for the pull):"
  echo "  rm -f \"$API_DIR/.env.local\" \"$API_DIR/.env.production.local\""
  echo "  cd \"$API_DIR\""
  echo "  vercel env pull .env.production.local --environment=production --yes"
  echo "  grep -q 'postgres' .env.production.local && echo 'OK: real Postgres URL in file'"
  echo ""
  echo "Or copy POSTGRES_URL from Vercel → tracking-app-api → Settings → Environment Variables"
  echo "  (click the eye icon), then in Terminal:"
  echo "  export DATABASE_URL='postgresql://...'"
  echo "  node \"$ROOT/scripts/migrate.mjs\" --production"
  echo ""
  echo "This run will try vercel env run without your broken .env.local (moved aside)."
  BACKUP_SUFFIX=".bak-before-migrate-$(date +%s)"
  for f in .env.local .env.production.local; do
    if [[ -f "$API_DIR/$f" ]]; then
      mv "$API_DIR/$f" "$API_DIR/$f$BACKUP_SUFFIX"
      echo "  moved $f → $f$BACKUP_SUFFIX"
    fi
  done
fi

echo "==> Running migrate with Vercel production env (tracking-app-api)"
cd "$API_DIR"
exec vercel env run --environment production --project tracking-app-api -- \
  node "$ROOT/scripts/migrate.mjs" --production
