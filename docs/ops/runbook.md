# Operations runbook

This is the local/self-hosted operational baseline. Production deployment still
requires approved infrastructure, TLS, KMS-backed encryption, monitoring, and an
executed disaster-recovery test.

## Service start and health

```bash
docker compose up -d postgres redis
pnpm db:migrate
pnpm dev
pnpm dev:worker
```

For a new production organisation follow **Greenfield organisation** in
`docs/DEPLOY.md`: migrate → `pnpm admin:create` → add people → issue connector
credentials → employee installs and activates → verify online within minutes.
Never seed a hosted database.

Check:

```bash
docker compose ps
curl -sS -o /dev/null -w "API HTTP %{http_code}\n" http://localhost:3001/
curl -fsS http://localhost:3000
curl -fsS http://127.0.0.1:9477/health
```

`pnpm db:seed` refuses to run without `TECHLIO_DEV_MODE=1` or against any
non-local database host. Demo data is for local validation only.

## Connector on an employee machine

| Task | macOS | Windows | Linux |
|------|-------|---------|-------|
| Status | `~/.techlio/connector/techlio-connector --status` | `%USERPROFILE%\.techlio\connector\techlio-connector.exe --status` | same as macOS |
| Service | LaunchAgent `com.techlio.connector` | Task Scheduler `TechlioConnector` | `systemctl --user status techlio-connector` |
| Logs | `~/.techlio-connector/connector.log` | Task history + stdout | `journalctl --user -u techlio-connector` |
| Uninstall | `… --uninstall` (keeps credentials and unsent events) | same | same |
| Full removal | `… --uninstall --purge` | same | same |

Credentials live in the OS credential store (Keychain / DPAPI / Secret
Service). `/health` reports `credentialStore`; `"file"` means no store was
available and 0600 files were used — acceptable only on single-user machines.

## Backup

Postgres and Redis use named Docker volumes. Take a Postgres logical backup
before migrations and at the approved backup interval:

```bash
mkdir -p backups
docker compose exec -T postgres \
  pg_dump -U techlio -d techlio_activity --format=custom \
  > "backups/techlio-$(date -u +%Y%m%dT%H%M%SZ).dump"
```

Requirements for production:

- Encrypt backup files with the approved KMS-managed key.
- Copy backups to an access-controlled location separate from the live host.
- Apply the approved retention period and record deletion.
- Record backup time, size, checksum, operator, and restore-test result.

## Restore drill

Restore only into an empty recovery database first. Never test restoration over
the only live database.

```bash
docker compose exec -T postgres \
  createdb -U techlio techlio_activity_restore
docker compose exec -T postgres \
  pg_restore -U techlio -d techlio_activity_restore --clean --if-exists \
  < backups/APPROVED_BACKUP.dump
docker compose exec -T postgres \
  psql -U techlio -d techlio_activity_restore \
  -c "select count(*) from activity_events;"
```

Validate organization, employee, device, event, session, hourly snapshot, and
audit counts. Validate that a sampled hourly snapshot still links to its source
events. Record actual recovery time and data-loss window.

## Migration and rollback

Before deployment:

1. Back up Postgres and verify the file is non-empty.
2. Build and test the exact revision.
3. Review every unapplied file under `infra/sql/`.
4. Run `pnpm db:migrate`.
5. Smoke-test login, connector health, batch ingestion, hourly detail, and RBAC.

Application rollback:

1. Stop new deployment traffic.
2. Redeploy the previously tested application revision.
3. Do not reverse a migration unless its reviewed rollback SQL exists.
4. If the old application is incompatible with the migrated schema, restore the
   pre-migration backup into a new database and repoint the services.
5. Preserve connector queues; do not clear them during an API rollback.

## Connector credential incident

If a device token or signing key may be exposed:

1. Revoke the device in Access/Connectors.
2. Stop or unpair the affected connector.
3. Review `audit_log` for registration, activation, ingest rejection, pause, and
   export actions.
4. Issue a new device credential from the administrator portal.
5. Activate it on the employee machine; activation binds a new Ed25519 key.
6. Confirm signed heartbeat/event ingestion and no activity from the revoked ID.

Never copy raw prompts, source bodies, command text, screenshots, or secrets into
the incident record.

## Telemetry incident

For stale, delayed, or missing events:

1. Preserve the dashboard coverage state; do not describe missing telemetry as
   zero activity.
2. Check connector process, pairing state, pause state, queue depth, and version.
3. Check API and Postgres health, then worker and Redis health.
4. Restore connectivity and confirm queued events upload with original
   `occurred_at` timestamps.
5. Confirm duplicate event IDs are rejected and late events create a new hourly
   version.
6. Record the gap interval, cause, recovery time, and affected connector IDs.

## Disaster recovery

Minimum exercise:

1. Provision a separate recovery environment.
2. Restore the latest database backup.
3. Deploy the same application revision and migrations.
4. Confirm RBAC and organization isolation.
5. Confirm a connector can upload a signed batch.
6. Confirm hourly finalization and late recalculation.
7. Record recovery-time objective (RTO) and recovery-point objective (RPO)
   achieved.

This procedure is documentation only until an owner executes and signs off a
drill in the intended production infrastructure.
