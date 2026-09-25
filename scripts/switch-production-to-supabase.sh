#!/usr/bin/env bash
# Point local production env + run migrations on Supabase (empty or after copy-database.sh).
# Does not print connection strings. Requires real password in .env.supabase.local.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SUPABASE_ENV="$ROOT/apps/api/.env.supabase.local"
PROD_ENV="$ROOT/apps/api/.env.production.local"
BACKUP="$ROOT/apps/api/.env.production.local.neon-backup"

read_var() {
  local file="$1" key="$2"
  local line
  line="$(grep -E "^${key}=" "$file" 2>/dev/null | tail -1 || true)"
  line="${line#*=}"
  line="${line%\"}"; line="${line#\"}"
  line="${line%\'}"; line="${line#\'}"
  printf '%s' "$line"
}

[[ -f "$SUPABASE_ENV" ]] || { echo "Missing $SUPABASE_ENV"; exit 1; }
SESSION="$(read_var "$SUPABASE_ENV" SUPABASE_SESSION_URL)"
POOLED="$(read_var "$SUPABASE_ENV" SUPABASE_POOLED_URL)"
[[ "$SESSION" == postgres* ]] || { echo "Set SUPABASE_SESSION_URL in .env.supabase.local"; exit 1; }
[[ "$POOLED" == postgres* ]] || { echo "Set SUPABASE_POOLED_URL in .env.supabase.local"; exit 1; }
if [[ "$SESSION" == *'YOUR-PASSWORD'* ]] || [[ "$SESSION" == *'[YOUR-PASSWORD]'* ]]; then
  echo "Replace [YOUR-PASSWORD] in .env.supabase.local with your Supabase database password first."
  exit 1
fi

if [[ -f "$PROD_ENV" && ! -f "$BACKUP" ]]; then
  cp "$PROD_ENV" "$BACKUP"
  echo "Backed up Neon URLs → apps/api/.env.production.local.neon-backup"
fi

# Preserve JWT_SECRET and other vars; replace only DB URLs.
touch "$PROD_ENV"
grep -v -E '^(DATABASE_URL|DATABASE_URL_UNPOOLED|POSTGRES_URL)=' "$PROD_ENV" > "${PROD_ENV}.tmp" 2>/dev/null || true
{
  cat "${PROD_ENV}.tmp" 2>/dev/null || true
  echo "DATABASE_URL=$POOLED"
  echo "DATABASE_URL_UNPOOLED=$SESSION"
} > "$PROD_ENV"
rm -f "${PROD_ENV}.tmp"
chmod 600 "$PROD_ENV" 2>/dev/null || true

echo "==> apps/api/.env.production.local now points at Supabase (pooler 6543 + session 5432)."
echo "==> Running migrations on the new database…"
node "$ROOT/scripts/migrate.mjs" --production

echo ""
echo "==> Next (you must do these):"
echo "  1. Create an admin login:"
echo "       pnpm admin:create:prod --email you@company.com --name \"Your Name\""
echo "  2. Vercel → API project → disconnect Neon integration"
echo "  3. Set DATABASE_URL = Supabase port 6543 URL, DATABASE_URL_UNPOOLED = port 5432 URL"
echo "  4. Redeploy API + web (pnpm deploy:all or Vercel dashboard)"
echo "  5. Employees: re-activate connector keys on My connectors (device IDs unchanged if you only moved DB empty)"
echo ""
echo "Historical analytics: only if you later copy from Neon (needs Neon Launch once + bash scripts/copy-database.sh)."
