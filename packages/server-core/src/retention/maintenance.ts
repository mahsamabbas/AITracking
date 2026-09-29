import { sql } from "drizzle-orm";
import { db } from "../db.js";
import { listOrganizationIds } from "../provider-identities.js";
import { archiveEventsDay, archiveSessionsDay } from "./archive.js";
import { archiveStore } from "./archive-store.js";
import { SLIM_BATCH_SQL } from "./payload.js";
import { DAY_MS, LONG_LIVED_SQL, dayKey, rawCutoff, retentionPolicy, utcDay } from "./policy.js";
import { rollupDay } from "./rollup.js";

/**
 * Nightly data maintenance (Vercel Cron → /v1/maintenance/retention, or
 * `pnpm db:retention:prod`). Every step is idempotent and bounded by a time
 * budget; an unfinished run simply continues next time.
 *
 * Order per organisation — nothing is removed before it is safe:
 *   1. summarise each UTC day once it is older than RAW_RETENTION_DAYS
 *   2. archive that day's raw events (verified) and only then delete them
 *   3. fold in late arrivals for already-archived days
 *   4. archive + remove sessions and long-lived events past SESSION_RETENTION_DAYS
 *   5. drop expired exports and audit rows; slim legacy payloads
 */

export interface MaintenanceReport {
  startedAt: string;
  finishedAt: string;
  complete: boolean;
  archive: string | null;
  policy: ReturnType<typeof retentionPolicy>;
  organizations: {
    organizationId: string;
    summarizedDays: number;
    archivedDays: number;
    purgedEvents: number;
    lateEvents: number;
    archivedSessionDays: number;
    purgedSessions: number;
    summarizedBefore: string | null;
    notes: string[];
  }[];
  exportsDeleted: number;
  auditDeleted: number;
  payloadsSlimmed: number;
  errors: string[];
}

const LOCK_JOB = "retention";

async function acquireLock(ttlMs: number): Promise<boolean> {
  const res = await db.execute<{ job: string }>(sql`
    INSERT INTO maintenance_runs (job, locked_until) VALUES (${LOCK_JOB}, NOW() + ${`${Math.ceil(ttlMs / 1000)} seconds`}::interval)
    ON CONFLICT (job) DO UPDATE SET locked_until = EXCLUDED.locked_until
      WHERE maintenance_runs.locked_until IS NULL OR maintenance_runs.locked_until < NOW()
    RETURNING job
  `);
  return res.rows.length > 0;
}

async function releaseLock(report: MaintenanceReport): Promise<void> {
  await db.execute(sql`
    UPDATE maintenance_runs SET locked_until = NULL, last_run_at = NOW(), last_report = ${JSON.stringify(report)}::jsonb
    WHERE job = ${LOCK_JOB}
  `);
}

/** Delete in bounded batches so no single statement runs long on a small database. */
async function deleteInBatches(statement: (batch: number) => ReturnType<typeof sql>, outOfTime: () => boolean): Promise<number> {
  let total = 0;
  for (;;) {
    const res = await db.execute(statement(5_000));
    const n = res.rowCount ?? 0;
    total += n;
    if (n < 5_000 || outOfTime()) return total;
  }
}

async function earliestEventDay(organizationId: string): Promise<Date | null> {
  const res = await db.execute<{ first: Date | string | null }>(sql`
    SELECT MIN(occurred_at) AS first FROM activity_events WHERE organization_id = ${organizationId}
  `);
  const first = res.rows[0]?.first;
  return first ? utcDay(new Date(first)) : null;
}

async function setSummarizedBefore(organizationId: string, before: Date): Promise<void> {
  await db.execute(sql`
    INSERT INTO retention_state (organization_id, summarized_before, updated_at)
    VALUES (${organizationId}, ${before}, NOW())
    ON CONFLICT (organization_id) DO UPDATE SET summarized_before = EXCLUDED.summarized_before, updated_at = NOW()
  `);
}

async function purgeRawDay(organizationId: string, day: Date, outOfTime: () => boolean): Promise<number> {
  const end = new Date(day.getTime() + DAY_MS);
  return deleteInBatches(
    (batch) => sql`
      DELETE FROM activity_events WHERE ctid IN (
        SELECT e.ctid FROM activity_events e
        WHERE e.organization_id = ${organizationId} AND e.occurred_at >= ${day} AND e.occurred_at < ${end}
          AND NOT ${sql.raw(LONG_LIVED_SQL("e"))}
        LIMIT ${batch})
    `,
    outOfTime,
  );
}

export async function runDataMaintenance(options: { budgetMs?: number; now?: Date } = {}): Promise<MaintenanceReport> {
  const started = Date.now();
  const budgetMs = options.budgetMs ?? Number(process.env.RETENTION_BUDGET_MS ?? 50_000);
  const outOfTime = () => Date.now() - started > budgetMs;
  const now = options.now ?? new Date();
  const policy = retentionPolicy();
  const store = archiveStore();
  const report: MaintenanceReport = {
    startedAt: new Date(started).toISOString(),
    finishedAt: "",
    complete: false,
    archive: store?.name ?? null,
    policy,
    organizations: [],
    exportsDeleted: 0,
    auditDeleted: 0,
    payloadsSlimmed: 0,
    errors: [],
  };

  if (!(await acquireLock(budgetMs + 120_000))) {
    report.errors.push("another maintenance run is in progress");
    report.finishedAt = new Date().toISOString();
    return report;
  }

  try {
    const cutoff = rawCutoff(now);
    const sessionCutoff = new Date(utcDay(now).getTime() - policy.sessionDays * DAY_MS);

    for (const organizationId of await listOrganizationIds()) {
      if (outOfTime()) break;
      const org = {
        organizationId,
        summarizedDays: 0,
        archivedDays: 0,
        purgedEvents: 0,
        lateEvents: 0,
        archivedSessionDays: 0,
        purgedSessions: 0,
        summarizedBefore: null as string | null,
        notes: [] as string[],
      };
      report.organizations.push(org);
      try {
        // 1. Summarise whole days older than the raw window, in order.
        const state = await db.execute<{ before: Date | string | null }>(sql`
          SELECT summarized_before AS before FROM retention_state WHERE organization_id = ${organizationId}
        `);
        let next = state.rows[0]?.before ? new Date(state.rows[0].before) : await earliestEventDay(organizationId);
        while (next && next < cutoff && !outOfTime()) {
          await rollupDay(organizationId, next);
          next = new Date(next.getTime() + DAY_MS);
          await setSummarizedBefore(organizationId, next);
          org.summarizedDays += 1;
        }
        if (next) org.summarizedBefore = next.toISOString();

        // 2. Archive, then remove, raw events of summarised days.
        if (!store) {
          org.notes.push("archive storage not configured: raw events are summarised but kept");
        } else if (next) {
          const due = await db.execute<{ day: string; archived: boolean }>(sql`
            SELECT d.day::text AS day, d.archived_at IS NOT NULL AS archived FROM retention_days d
            WHERE d.organization_id = ${organizationId} AND d.purged_at IS NULL AND d.day < ${dayKey(next)}::date
            ORDER BY d.day
          `);
          for (const row of due.rows) {
            if (outOfTime()) break;
            const day = new Date(`${row.day}T00:00:00Z`);
            if (!row.archived) {
              const rec = await archiveEventsDay(organizationId, day);
              await db.execute(sql`
                UPDATE retention_days SET archived_at = NOW() WHERE organization_id = ${organizationId} AND day = ${row.day}::date
              `);
              org.archivedDays += 1;
              if (rec.rows === 0) org.archivedDays -= 1; // empty day: nothing written
            }
            org.purgedEvents += await purgeRawDay(organizationId, day, outOfTime);
            await db.execute(sql`
              UPDATE retention_days SET purged_at = NOW() WHERE organization_id = ${organizationId} AND day = ${row.day}::date
            `);
          }

          // 3. Late arrivals (connector was offline) for days already archived.
          const late = await db.execute<{ day: string; n: number }>(sql`
            SELECT d.day::text AS day, COUNT(*)::int AS n
            FROM retention_days d
            JOIN activity_events e ON e.organization_id = d.organization_id
              AND e.occurred_at >= d.day::timestamp AT TIME ZONE 'UTC'
              AND e.occurred_at < (d.day + 1)::timestamp AT TIME ZONE 'UTC'
            WHERE d.organization_id = ${organizationId} AND d.purged_at IS NOT NULL
              AND NOT ${sql.raw(LONG_LIVED_SQL("e"))}
            GROUP BY d.day ORDER BY d.day LIMIT 30
          `);
          for (const row of late.rows) {
            if (outOfTime()) break;
            const day = new Date(`${row.day}T00:00:00Z`);
            await archiveEventsDay(organizationId, day, `late-${Date.now()}`);
            await rollupDay(organizationId, day, "add");
            org.lateEvents += await purgeRawDay(organizationId, day, outOfTime);
          }
        }

        // 4. Sessions and long-lived events past the session window.
        if (store && !outOfTime()) {
          const oldDays = await db.execute<{ day: string }>(sql`
            SELECT DISTINCT (started_at AT TIME ZONE 'UTC')::date::text AS day FROM agent_sessions
            WHERE organization_id = ${organizationId} AND started_at < ${sessionCutoff}
            ORDER BY 1 LIMIT 60
          `);
          for (const row of oldDays.rows) {
            if (outOfTime()) break;
            const day = new Date(`${row.day}T00:00:00Z`);
            const end = new Date(day.getTime() + DAY_MS);
            await archiveSessionsDay(organizationId, day);
            org.archivedSessionDays += 1;
            const ids = sql`SELECT id FROM agent_sessions WHERE organization_id = ${organizationId} AND started_at >= ${day} AND started_at < ${end}`;
            await db.execute(sql`DELETE FROM session_context_versions WHERE session_id IN (${ids})`);
            const del = await db.execute(sql`DELETE FROM agent_sessions WHERE organization_id = ${organizationId} AND started_at >= ${day} AND started_at < ${end}`);
            org.purgedSessions += del.rowCount ?? 0;
          }
          // Long-lived events were included in their day's archive at 14 days.
          await deleteInBatches(
            (batch) => sql`
              DELETE FROM activity_events WHERE ctid IN (
                SELECT e.ctid FROM activity_events e
                WHERE e.organization_id = ${organizationId} AND e.occurred_at < ${sessionCutoff}
                  AND e.occurred_at < ${cutoff}
                LIMIT ${batch})
            `,
            outOfTime,
          );
          await db.execute(sql`
            DELETE FROM hourly_snapshots WHERE organization_id = ${organizationId} AND hour_start < ${sessionCutoff}
          `);
        }
      } catch (err) {
        report.errors.push(`${organizationId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // 5. Housekeeping across organisations.
    if (!outOfTime()) {
      const exp = await db.execute(sql`
        DELETE FROM activity_exports WHERE created_at < NOW() - ${`${policy.exportDays} days`}::interval
      `);
      report.exportsDeleted = exp.rowCount ?? 0;
      report.auditDeleted = await deleteInBatches(
        (batch) => sql`
          DELETE FROM audit_log WHERE ctid IN (
            SELECT ctid FROM audit_log
            WHERE created_at < NOW() - ${`${policy.auditDays} days`}::interval
               -- Per-upload bookkeeping rows (no longer written) carry no audit value.
               OR (action = 'events.batch_ingest' AND created_at < NOW() - INTERVAL '2 days')
            LIMIT ${batch})
        `,
        outOfTime,
      );
    }
    while (!outOfTime()) {
      const res = await db.execute(sql.raw(SLIM_BATCH_SQL(2_000)));
      const n = res.rowCount ?? 0;
      report.payloadsSlimmed += n;
      if (n < 2_000) break;
    }
    report.complete = !outOfTime() && report.errors.length === 0;
  } finally {
    report.finishedAt = new Date().toISOString();
    await releaseLock(report).catch(() => undefined);
  }
  return report;
}

/** Last run's report (for the settings page and health checks). */
export async function lastMaintenanceReport(): Promise<{ lastRunAt: string | null; report: MaintenanceReport | null }> {
  try {
    const res = await db.execute<{ last_run_at: Date | null; last_report: MaintenanceReport | null }>(sql`
      SELECT last_run_at, last_report FROM maintenance_runs WHERE job = ${LOCK_JOB}
    `);
    const row = res.rows[0];
    return { lastRunAt: row?.last_run_at ? new Date(row.last_run_at).toISOString() : null, report: row?.last_report ?? null };
  } catch {
    return { lastRunAt: null, report: null };
  }
}
