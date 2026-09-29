/**
 * Run data maintenance now (summarise → archive → purge), e.g. for the first
 * run or to catch up a backlog. The nightly Vercel Cron runs the same job.
 *   pnpm db:retention          local database
 *   pnpm db:retention:prod     production (scripts/retention-prod.sh)
 */
import { pool, runDataMaintenance } from "@techlio/server-core";

const minutes = Number(process.argv.find((a) => a.startsWith("--minutes="))?.split("=")[1] ?? 15);
const report = await runDataMaintenance({ budgetMs: minutes * 60_000 });
for (const o of report.organizations) {
  console.log(
    `${o.organizationId}: summarised ${o.summarizedDays} day(s), archived ${o.archivedDays}, removed ${o.purgedEvents} raw event(s)` +
      (o.lateEvents ? `, ${o.lateEvents} late` : "") +
      (o.purgedSessions ? `, ${o.purgedSessions} old session(s)` : "") +
      (o.notes.length ? `\n  note: ${o.notes.join("; ")}` : ""),
  );
}
console.log(
  `archive: ${report.archive ?? "not configured (nothing is removed until it is)"} · exports removed ${report.exportsDeleted} · audit rows removed ${report.auditDeleted} · payloads slimmed ${report.payloadsSlimmed}`,
);
if (report.errors.length) console.error("errors:", report.errors.join("; "));
console.log(report.complete ? "Done." : "Stopped at the time budget — run again to continue.");
await pool.end();
process.exit(report.errors.length ? 1 : 0);
