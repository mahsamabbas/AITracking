# Authentication, authorization, tenancy

## Portal users
- Passwords: scrypt with per-user salt (`scrypt$<salt>$<hash>`); policy ≥ 8 chars, one capital, one special.
- `POST /v1/auth/login` → HS256 JWT (`JWT_SECRET`, 12 h) with user id, org, role, developerId.
  Stored in browser `localStorage` (`techlio-jwt`).
- Dev only (`TECHLIO_DEV_MODE=1`): `x-role`/`x-user-id`/`x-org-id` headers can stand in for a
  token. Hosted runtimes reject token-less requests (`token_required`).
- Optional device biometrics (WebAuthn) unlock a stored session on phones.

## Devices (connectors)
- Device tokens stored only as SHA-256 hashes; the connector keeps token + Ed25519 private key
  in the OS secret store.
- Every batch must carry an Ed25519 signature over the exact JSON body (only exception: local dev token).
- A device may only report its own developer; only `provider_pull` devices may send Tier B.
- Pairing: dashboard → connector `/claim` (device id, token, consent) → connector generates key
  pair → `POST /v1/connectors/activate` (JWT + public key).

## Authorization layers
1. `DashboardAuthGuard` — valid JWT.
2. Tenant — `orgAccessFromRequest` → `resolveOrgAccess` (`server-core/src/org-context.ts`).
3. Role — `requireRoles`, `canViewDeveloper`, `canPauseConnector`, `canExportActivity`, `assertCanViewPeople`.
4. Row scoping — `organization_id` on every query; developers narrowed to their own id (`scopeDeveloperIds`).

## Multi-tenancy (shared schema)
- `customer` organisations hold people; one `platform` organisation holds super admins.
- Tenant comes from the verified JWT, never request data — except super admins: inside
  `/platform/[orgId]` the web sends `x-techlio-org-id`; `resolveOrgAccess` requires a customer
  org that exists and is enabled, then the super admin acts as its administrator. Any other
  role naming another org → 403 `org_context_forbidden`.
- Connector token → device's `organization_id`; a batch naming another org → `org_mismatch`.
- `disabled_at` blocks sign-in into the workspace and ingest (403 `organization_disabled`).
- Migration 016: RLS on + Supabase public roles revoked, so the Supabase REST data API reads
  nothing. The API connects as table owner (RLS does not apply to it).

## Known gaps (see ../04-operations/security.md)
Open CORS (`app.enableCors()`), no login rate limiting, JWT in localStorage without revocation,
unsigned installers.
