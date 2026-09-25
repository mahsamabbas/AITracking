#!/usr/bin/env bash
# Deploy from monorepo ROOT. Vercel project "Root Directory" must be apps/api or apps/web.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:-}"

usage() {
  echo "Usage: $0 api|web|all"
  echo "  api  → project tracking-app-api (root: apps/api)"
  echo "  web  → project tracking-app-api-t9yd (root: apps/web)"
  exit 1
}

deploy_one() {
  local project="$1"
  cd "$ROOT"
  if [[ ! -f "$ROOT/.vercelignore" ]]; then
    echo "ERROR: Missing .vercelignore at repo root (deploy would upload .git and exceed 100 MB file limits)."
    exit 1
  fi
  vercel link --project "$project" --yes
  vercel deploy --prod --yes
}

case "$TARGET" in
  api) deploy_one tracking-app-api ;;
  web) deploy_one tracking-app-api-t9yd ;;
  all)
    deploy_one tracking-app-api
    deploy_one tracking-app-api-t9yd
    ;;
  *) usage ;;
esac
