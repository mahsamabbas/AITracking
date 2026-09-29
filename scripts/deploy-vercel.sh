#!/usr/bin/env bash
# Deploy from monorepo ROOT. Vercel project "Root Directory" must be apps/api or apps/web.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:-}"
# Override for your Vercel team (defaults suit a fresh account; legacy names below).
API_PROJECT="${VERCEL_API_PROJECT:-ai-tracking}"
WEB_PROJECT="${VERCEL_WEB_PROJECT:-ai-tracking-bhgg}"
SCOPE_ARGS=()
if [[ -n "${VERCEL_SCOPE:-}" ]]; then
  SCOPE_ARGS=(--scope "$VERCEL_SCOPE")
fi

usage() {
  echo "Usage: $0 api|web|all"
  echo "  api  → Vercel project \$VERCEL_API_PROJECT (default: $API_PROJECT), root: apps/api"
  echo "  web  → Vercel project \$VERCEL_WEB_PROJECT (default: $WEB_PROJECT), root: apps/web"
  echo "  Legacy team projects: VERCEL_API_PROJECT=tracking-app-api VERCEL_WEB_PROJECT=tracking-app-api-t9yd"
  exit 1
}

deploy_one() {
  local project="$1"
  local root_dir="$2"
  cd "$ROOT"
  if [[ ! -f "$ROOT/.vercelignore" ]]; then
    echo "ERROR: Missing .vercelignore at repo root (deploy would upload .git and exceed 100 MB file limits)."
    exit 1
  fi
  # Deploy from the repo root: the project's Root Directory ($root_dir) selects
  # the app, and the build needs the whole monorepo (packages/*, lockfile).
  # --cwd "$root_dir" uploaded only that folder and the build failed.
  vercel link --project "$project" --yes "${SCOPE_ARGS[@]}"
  vercel deploy --prod --yes "${SCOPE_ARGS[@]}"
}

case "$TARGET" in
  api) deploy_one "$API_PROJECT" apps/api ;;
  web) deploy_one "$WEB_PROJECT" apps/web ;;
  all)
    deploy_one "$API_PROJECT" apps/api
    deploy_one "$WEB_PROJECT" apps/web
    ;;
  *) usage ;;
esac
