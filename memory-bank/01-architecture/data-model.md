# Data model

Schema is owned by ordered SQL files in `infra/sql/` (applied by `scripts/migrate.mjs`,
tracked in `schema_migrations`; production migrates during the API build). Drizzle
definitions in `packages/server-core/src/schema.ts` mirror the tables code writes via the ORM.
Current expected migration: **`017_connector_remote_pause.sql`** (`schema-version.ts`).

Every tenant-owned table has `organization_id`; every query filters by it.

## Tables (19)

| Table | Purpose | Key fields |
|-------|---------|-----------|
| `organizations` | Tenants (`kind` customer \| platform) | `timezone`, `logo_url`, `ai_plan_limits`, `disabled_at` |
| `employees` | Monitored people; `id` = `developer_id` on every event | `display_name`, `email`, `team`, `title`, `status`, `joined_at` |
| `portal_users` | Sign-in accounts | `email`, `password_hash` (scrypt), `role`, `developer_id`, `avatar_url` |
| `devices` | Connector installs + `provider_pull` sources | `token_hash` (SHA-256), `public_key` (Ed25519), `provider`, `label`, `kind`, `revoked_at` |
| `connector_health` | Latest heartbeat per device | `last_heartbeat`, `version`, `queue_depth`, `paused`, `remote_paused`, `provider`, `capabilities` |
| `activity_events` | Raw events (14-day window) | `event_id` PK, `developer_id`, `device_id`, `session_id`, `event_type`, `occurred_at`, `received_at`, `payload` (slim jsonb). Index `(organization_id, occurred_at DESC)` |
| `agent_sessions` | Derived sessions | five durations + idle, counts (requests, tool calls, tests, builds, file changes), tokens, `models_used`, `classification`, `coverage_state`, project/work item |
| `session_context_versions` | Relabel history | `version`, `label`, `recorded_at` |
| `hourly_snapshots` | Versioned hour cards | `hour_start`, `version`, `metrics`, `completeness`, `recalc_reason` |
| `activity_hourly` | Retention rollup of the event-time engine | per person × UTC hour (+ by provider) |
| `projects`, `work_items` | Optional work context | `name`/`title`, `external_ref` |
| `employee_provider_identities` | Provider account → employee (Tier B attribution) | |
| `audit_log` | Sensitive actions | `actor_id`, `action`, `detail` |
| `activity_exports` | Generated CSV/PDF | `format`, `content`, `requested_by` |
| `retention_state`, `retention_days`, `data_archives`, `maintenance_runs` | Retention bookkeeping | `summarized_before` watermark, per-day progress, archive objects, run lease/report |

## Migration history

| # | Change |
|---|--------|
| 001–005 | Initial schema, devices/projects/sessions, connector provider, portal users, employees + session metrics |
| 006–011 | Demo state (later dropped), AI plan limits, default credentials disabled, provider identities, phantom sessions removed |
| 012 | Connector capability reports |
| 013 | Multi-tenant (`organizations.kind/created_at/disabled_at`), feed index, agent-only file/test/build counts |
| 014 | Avatars + organisation logos |
| 015 | Data retention tables |
| 016 | RLS on every public table; revoke Supabase `anon`/`authenticated` |
| 017 | `connector_health.remote_paused` |

## Adding a migration

1. `infra/sql/0NN_name.sql` (idempotent: `IF NOT EXISTS`).
2. Mirror in `schema.ts` if code writes the column via Drizzle.
3. Bump `EXPECTED_SCHEMA_MIGRATION` in `server-core/src/schema-version.ts` (`/v1/health` checks it).
4. `pnpm db:migrate` locally; production applies it on the next API deploy.
