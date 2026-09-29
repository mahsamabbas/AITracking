#!/usr/bin/env bash
# Push Supabase DATABASE_URL (6543) + DATABASE_URL_UNPOOLED (5432) to Vercel API project.
# Reads apps/api/.env.supabase.local — never prints connection strings.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SUPABASE_ENV="$ROOT/apps/api/.env.supabase.local"
API_DIR="$ROOT/.vercel-api"
API_PROJECT="${VERCEL_API_PROJECT:-tracking-app-api}"

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
POOLED="$(read_var "$SUPABASE_ENV" SUPABASE_POOLED_URL)"
SESSION="$(read_var "$SUPABASE_ENV" SUPABASE_SESSION_URL)"
[[ "$POOLED" == postgres* ]] || { echo "Set SUPABASE_POOLED_URL"; exit 1; }
[[ "$SESSION" == postgres* ]] || { echo "Set SUPABASE_SESSION_URL"; exit 1; }

mkdir -p "$API_DIR"
cd "$API_DIR"
vercel link --project "$API_PROJECT" --yes 2>/dev/null || vercel link --project "$API_PROJECT"

upsert_env() {
  local name="$1"
  local value="$2"
  vercel env rm "$name" production --yes 2>/dev/null || true
  printf '%s' "$value" | vercel env add "$name" production
}

echo "==> Updating Vercel production DATABASE_URL (6543 pooler)"
upsert_env DATABASE_URL "$POOLED"
echo "==> Updating Vercel production DATABASE_URL_UNPOOLED (5432 session)"
upsert_env DATABASE_URL_UNPOOLED "$SESSION"
echo "==> Updating TECHLIO_DATABASE_URL (wins over integration-injected DATABASE_URL)"
upsert_env TECHLIO_DATABASE_URL "$POOLED"

# Neon integration often sets POSTGRES_* — remove so they do not override runtime.
for key in POSTGRES_URL POSTGRES_URL_NON_POOLING POSTGRES_PRISMA_URL POSTGRES_URL_NO_SSL; do
  vercel env rm "$key" production --yes 2>/dev/null || true
done

echo "==> Done. Disconnect Neon under Vercel → Integrations if it is still linked."
echo "    Then redeploy: SKIP_DB_MIGRATE=1 pnpm deploy:all"
