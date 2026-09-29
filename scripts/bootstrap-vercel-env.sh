#!/usr/bin/env bash
# Push required production env vars to new Vercel projects (run after vercel login).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_PROJECT="${VERCEL_API_PROJECT:-techlio-api}"
WEB_PROJECT="${VERCEL_WEB_PROJECT:-techlio-web}"
API_URL="${NEXT_PUBLIC_API_URL:-}"

upsert_api_env() {
  local name="$1" value="$2"
  cd "$ROOT/.vercel-api"
  vercel link --project "$API_PROJECT" --yes
  vercel env rm "$name" production --yes 2>/dev/null || true
  printf '%s' "$value" | vercel env add "$name" production
}

mkdir -p "$ROOT/.vercel-api"

API_ENV="$ROOT/apps/api/.env"
if [[ -f "$API_ENV" ]] && grep -qE '^DATABASE_URL=postgres' "$API_ENV" 2>/dev/null; then
  echo "==> API env file → $API_PROJECT"
  VERCEL_API_PROJECT="$API_PROJECT" bash "$ROOT/scripts/push-api-env-to-vercel.sh" "$API_ENV"
elif [[ -f "$ROOT/apps/api/.env.supabase.local" ]]; then
  echo "==> Supabase env file → $API_PROJECT"
  VERCEL_API_PROJECT="$API_PROJECT" bash "$ROOT/scripts/push-supabase-vercel-env.sh"
else
  echo "Add DATABASE_URL to apps/api/.env or apps/api/.env.supabase.local" >&2
  exit 1
fi

if [[ -z "${JWT_SECRET:-}" ]]; then
  if command -v openssl >/dev/null 2>&1; then
    JWT_SECRET="$(openssl rand -hex 32)"
  else
    echo "Set JWT_SECRET in the environment and re-run." >&2
    exit 1
  fi
fi
echo "==> JWT_SECRET, SKIP_REDIS, ORG_TIMEZONE → $API_PROJECT"
upsert_api_env JWT_SECRET "$JWT_SECRET"
upsert_api_env SKIP_REDIS "1"
upsert_api_env ORG_TIMEZONE "${ORG_TIMEZONE:-Asia/Karachi}"
upsert_api_env NODE_ENV production

if [[ -n "$API_URL" ]]; then
  echo "==> NEXT_PUBLIC_API_URL → $WEB_PROJECT"
  cd "$ROOT/apps/web"
  vercel link --project "$WEB_PROJECT" --yes
  vercel env rm NEXT_PUBLIC_API_URL production --yes 2>/dev/null || true
  printf '%s' "$API_URL" | vercel env add NEXT_PUBLIC_API_URL production
fi

echo "Done. Deploy with: VERCEL_API_PROJECT=$API_PROJECT VERCEL_WEB_PROJECT=$WEB_PROJECT pnpm exec bash scripts/deploy-vercel.sh all"
