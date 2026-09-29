#!/usr/bin/env bash
# First deploy on a new Vercel account (after `vercel login`).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

API_PROJECT="${VERCEL_API_PROJECT:-techlio-api}"
WEB_PROJECT="${VERCEL_WEB_PROJECT:-techlio-web}"

echo "==> Build shared packages"
pnpm --filter @techlio/server-core run build

echo "==> Push API env (Supabase + JWT + runtime flags)"
bash "$ROOT/scripts/bootstrap-vercel-env.sh"

echo "==> Deploy API ($API_PROJECT)"
API_DEPLOY_URL="$(
  vercel link --project "$API_PROJECT" --yes --cwd "$ROOT/apps/api"
  vercel deploy --prod --yes --cwd "$ROOT/apps/api" | tee /dev/stderr | tail -1
)"
API_URL="${API_DEPLOY_URL%/}"
if [[ "$API_URL" != https://* ]]; then
  echo "WARN: Could not parse API URL from deploy output. Set NEXT_PUBLIC_API_URL manually."
  read -r -p "Production API URL (https://…): " API_URL
fi

echo "==> Point web at $API_URL"
cd "$ROOT/apps/web"
vercel link --project "$WEB_PROJECT" --yes
vercel env rm NEXT_PUBLIC_API_URL production --yes 2>/dev/null || true
printf '%s' "$API_URL" | vercel env add NEXT_PUBLIC_API_URL production

echo "==> Deploy web ($WEB_PROJECT)"
vercel deploy --prod --yes --cwd "$ROOT/apps/web"

echo ""
echo "Dashboard: deploy output URL above (or vercel open --cwd apps/web)"
echo "API health: curl -s $API_URL/v1/health"
echo "Create admin: DATABASE_URL from apps/api/.env.production.local pnpm admin:create:prod"
