# Data retention

Code: `packages/server-core/src/retention/*` (policy, rollup, archive-store, archive,
maintenance). Tables: `activity_hourly`, `retention_state`, `retention_days`, `data_archives`,
`maintenance_runs` (migration 015).

| Data | Kept in DB | Then |
|------|-----------|------|
| Raw events | 14 days (`RAW_RETENTION_DAYS`, min 3) | summarised into `activity_hourly`, archived (gzip JSONL) to Storage, deleted |
| Long-lived event types / sessions | 190 days (`SESSION_RETENTION_DAYS`) | archived, deleted |
| Audit log | 400 days | deleted |
| Exports | 7 days | deleted |

- Nightly: Vercel Cron 21:30 UTC → `GET /v1/maintenance/retention` (`CRON_SECRET`). Worker runs
  the same job daily if deployed. Manual: `pnpm db:retention` / `pnpm db:retention:prod`.
- Whole UTC days only; resumable; time budget per run (`RETENTION_BUDGET_MS`); lease in
  `maintenance_runs`. **Never purges without a successful archive**; no archive store → data kept.
- Readers switch to `activity_hourly` before `retention_state.summarized_before` (no double count).
- Archives listed/downloaded (CSV or lossless JSONL) in Settings → Data & archive.
- Verified on a 199k-event copy (2026-09-29): 1,343/1,343 chart metrics identical after archiving.

## Capacity (2026-09-30 measurement)
Production DB 15 MB; ~1 KB/event; ~1,200 events per active developer per day → ~15 MB raw per
active developer at a 14-day window. 500 MB (Supabase Free) ≈ 25–30 active developers at 14
days, ≈ 55 at 7 days. First production retention run expected 2026-09-30 21:30 UTC — check
`maintenance_runs`.
