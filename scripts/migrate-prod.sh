#!/usr/bin/env bash
# Run migrations against production Postgres using Vercel-injected env.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="$ROOT/apps/api"

# An explicitly exported URL always wins. This is the reliable path when the
# Vercel database variables are marked Sensitive: Vercel never returns
# Sensitive values to the CLI (pull writes "[SENSITIVE]", env run injects none).
EXPORTED_URL="${DATABASE_URL:-${POSTGRES_URL:-}}"
if [[ -n "$EXPORTED_URL" && "$EXPORTED_URL" != *SENSITIVE* && "$EXPORTED_URL" == postgres* ]]; then
  echo "==> Using DATABASE_URL from your shell"
  exec node "$ROOT/scripts/migrate.mjs" --production
fi

corrupted_env() {
  local f="$1"
  [[ -f "$f" ]] && grep -q '\[SENSITIVE\]' "$f" 2>/dev/null
}

prod_env_file="$API_DIR/.env.production.local"
if [[ -f "$prod_env_file" ]] && ! corrupted_env "$prod_env_file"; then
  if grep -qE '^DATABASE_URL(_UNPOOLED)?=postgres' "$prod_env_file" 2>/dev/null \
    || grep -qE '^POSTGRES_URL=postgres' "$prod_env_file" 2>/dev/null; then
    echo "==> Using apps/api/.env.production.local (real Postgres URL)"
    exec node "$ROOT/scripts/migrate.mjs" --production
  fi
fi

if corrupted_env "$API_DIR/.env.local" || corrupted_env "$API_DIR/.env.production.local"; then
  echo "NOTE: apps/api/.env*.local contain [SENSITIVE] placeholders."
  echo "      Your database variables are marked Sensitive on Vercel, and Vercel never"
  echo "      returns Sensitive values to the CLI — re-pulling cannot fix this."
  echo ""
  echo "Reliable fix: copy the connection string from the Neon console"
  echo "  (console.neon.tech → your project → Connect → connection string),"
  echo "  then in this terminal:"
  echo "    read -rs DATABASE_URL && export DATABASE_URL    # paste, press Enter"
  echo "    pnpm db:migrate:prod"
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
