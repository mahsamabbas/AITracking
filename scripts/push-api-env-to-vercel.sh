#!/usr/bin/env bash
# Push variables from a local API env file to Vercel production (never uploaded with deploy).
# Usage: VERCEL_API_PROJECT=ai-tracking bash scripts/push-api-env-to-vercel.sh [path-to-env]
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${1:-$ROOT/apps/api/.env}"
API_PROJECT="${VERCEL_API_PROJECT:-ai-tracking}"
API_DIR="$ROOT/.vercel-api"

SKIP_KEYS_REGEX='^(TECHLIO_DEV_MODE|ALLOW_DEV_HEADER_AUTH|VERCEL_|NX_|TURBO_)'

read_var() {
  local file="$1" key="$2"
  local line
  line="$(grep -E "^${key}=" "$file" 2>/dev/null | tail -1 || true)"
  [[ -n "$line" ]] || return 1
  line="${line#*=}"
  line="${line%\"}"; line="${line#\"}"
  line="${line%\'}"; line="${line#\'}"
  printf '%s' "$line"
}

[[ -f "$ENV_FILE" ]] || { echo "Missing env file: $ENV_FILE" >&2; exit 1; }

mkdir -p "$API_DIR"
cd "$API_DIR"
vercel link --project "$API_PROJECT" --yes 2>/dev/null || vercel link --project "$API_PROJECT"

upsert_env() {
  local name="$1" value="$2"
  [[ -n "$value" ]] || return 0
  vercel env rm "$name" production --yes 2>/dev/null || true
  printf '%s' "$value" | vercel env add "$name" production
  echo "  + $name"
}

echo "==> Pushing env from $(basename "$ENV_FILE") → Vercel project $API_PROJECT (production)"

while IFS= read -r raw || [[ -n "$raw" ]]; do
  line="${raw%%#*}"
  line="$(echo "$line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
  [[ -z "$line" ]] && continue
  [[ "$line" != *=* ]] && continue
  key="${line%%=*}"
  key="$(echo "$key" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | sed 's/^export[[:space:]]*//')"
  val="${line#*=}"
  val="$(echo "$val" | sed 's/^[[:space:]]*//')"
  if [[ "$val" == \"*\" && "$val" == *\" ]]; then val="${val:1:${#val}-2}"; fi
  if [[ "$val" == \'*\' && "$val" == *\' ]]; then val="${val:1:${#val}-2}"; fi
  if [[ "$key" =~ $SKIP_KEYS_REGEX ]]; then
    continue
  fi
  upsert_env "$key" "$val"
done < "$ENV_FILE"

# Same precedence as production runtime: explicit TECHLIO_DATABASE_URL wins over integrations.
if pooled="$(read_var "$ENV_FILE" DATABASE_URL)" && [[ "$pooled" == postgres* ]]; then
  upsert_env TECHLIO_DATABASE_URL "$pooled"
fi

for key in POSTGRES_URL POSTGRES_URL_NON_POOLING POSTGRES_PRISMA_URL POSTGRES_URL_NO_SSL; do
  vercel env rm "$key" production --yes 2>/dev/null || true
done

echo "==> Done. Redeploy API for runtime to pick up changes."
