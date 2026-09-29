# Security posture

## In place
- scrypt passwords; 12 h HS256 JWT; header identity only in `TECHLIO_DEV_MODE`; demo credentials disabled (008).
- Device trust: hashed tokens, Ed25519-signed batches, device → developer binding, org match,
  revocation, Tier B only from `provider_pull`.
- Tenant isolation: org from JWT; `organization_id` on every query; super-admin access only into
  a validated, enabled customer org; disabled tenants stop ingesting.
- Supabase Data API locked (016: RLS + revoked public roles).
- Data minimisation: metadata only; OTLP prompt/response logging forced off; hook payloads
  normalised in the hook process; server-side `scanEventForSecrets` rejects events with secret
  patterns; commits are counts only.
- Connector local API bound to 127.0.0.1 with trusted origins; secrets in OS stores; encrypted queue.
- `CRON_SECRET` constant-time check; `audit_log` for sensitive actions.

## Known gaps (open)
- CORS open (`app.enableCors()` without an origin list) — relies on bearer tokens.
- No rate limiting / lockout on `POST /v1/auth/login`.
- JWT in `localStorage`, no revocation before expiry.
- Installers unsigned (ad-hoc).
- **Credential rotation pending:** the Supabase secret key and DB password were shared in chat
  during development (2026-09-29); the DB URL push on 2026-09-29/30 re-sent unchanged values.
  Rotate in Supabase → update `apps/api/.env.supabase.local` → `push-supabase-vercel-env.sh`
  → `vercel env` for `SUPABASE_SECRET_KEY` → redeploy.
- Legacy: the old Neon password was also exposed; Neon is no longer used.

Never write secret values into this memory bank.
