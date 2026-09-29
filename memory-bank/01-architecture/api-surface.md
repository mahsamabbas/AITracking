# API surface

All routes under `/v1`. Dashboard routes: `Authorization: Bearer <JWT>`. Connector routes:
device bearer token (+ Ed25519 `x-signature` on batches). Range params: `preset`
(`today|yesterday|7d|30d|90d`) or `from`/`to` calendar dates (local days, inclusive `to`).
Headers from the web: `x-techlio-display-timezone`, `x-techlio-org-id` (super admin in a workspace).

| Area | Endpoints | Access |
|------|-----------|--------|
| Auth | `POST auth/login` · `GET auth/me` · `PATCH me` · `PATCH me/password` | public / JWT |
| Branding | `GET/PATCH org/branding` | admin |
| Analytics | `GET analytics/organization` · `GET employees` · `GET employees/:id` · `GET employees/:id/tools/:provider` · `GET employees/:id/sessions` · `GET sessions/:id` · `GET employees/:id/workday` · `GET employees/:id/activity-calendar` · `GET employees/:id/ai-progress/timeline` (no UI consumer) · `GET activity` · `GET leaderboard` · `GET meta/filters` (provider list = catalogue) · `GET analytics/coverage` · `DELETE employees/:id` | scoped by role |
| Live | `GET dashboard/live` · `GET developers/:id/timeline` · `GET hourly-snapshots/:id` | scoped |
| Connectors | `POST connectors/register` (admin; provider must be in catalogue) · `POST connectors/activate` (JWT + device token + public key) · `GET connectors/config` (public: trusted origins) · `GET connectors/mine` · `POST connectors/:id/heartbeat` (device token; replies `{ ok, remotePaused }`) · `GET :id/health` · `POST :id/pause|resume|revoke` | per role |
| Ingest | `POST events/batch` → `{ accepted, rejected, reasons }`, 400 if nothing usable · `POST events/timesheet` → 404 by design | device |
| Org | `GET/POST users` · `GET org/developers` · `GET audit-log` · `GET org/policy` | admin / auditor |
| Platform | `GET/POST/PATCH platform/organizations[/:id]` · `POST …/:id/admins` | super_admin |
| Exports | `POST activity-exports` (range, team, provider; cap 5,000 events) · `GET activity-exports/:id` | admin, manager |
| Archives | `GET archives` · `GET archives/:id` | admin, auditor, super_admin |
| Maintenance | `GET maintenance/retention` | `CRON_SECRET` bearer |
| Context | `GET projects` · `GET work-items` · `POST sessions/:id/context` | JWT |
| Health | `GET health` (db + schema status) | public |

Controllers: `apps/api/src/*.controller.ts`. Rule: controllers authenticate, resolve tenant
(`orgAccessFromRequest`), check roles, parse range, call server-core. No business logic.
