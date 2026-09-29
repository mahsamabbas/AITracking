import { timingSafeEqual } from "node:crypto";
import { Controller, ForbiddenException, Get, NotFoundException, Param, Query, Req, Res, UnauthorizedException, UseGuards } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  archiveStore,
  db,
  eventsToCsv,
  lastMaintenanceReport,
  readArchive,
  retentionPolicy,
  runDataMaintenance,
  sql,
} from "@techlio/server-core";
import { DashboardAuthGuard, requireRoles } from "./auth/guards.js";
import { orgAccessFromRequest } from "./auth/org-scope.js";

function secretMatches(given: string | undefined, expected: string): boolean {
  const a = Buffer.from(given ?? "");
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Nightly data maintenance. Vercel Cron calls this with
 * `Authorization: Bearer $CRON_SECRET`; nothing else can trigger it.
 */
@Controller("v1/maintenance")
export class MaintenanceController {
  @Get("retention")
  async retention(@Req() req: FastifyRequest) {
    const secret = process.env.CRON_SECRET;
    const header = String(req.headers.authorization ?? "");
    if (!secret || !secretMatches(header.replace(/^Bearer\s+/i, ""), secret)) {
      throw new UnauthorizedException("cron_secret_required");
    }
    return runDataMaintenance();
  }
}

/** Archived activity (older than the raw window): list and download per organisation. */
@Controller("v1/archives")
@UseGuards(DashboardAuthGuard)
export class ArchivesController {
  @Get()
  async list(@Req() req: FastifyRequest, @Query("limit") limit?: string) {
    const { organizationId, actor } = await orgAccessFromRequest(req);
    requireRoles(actor, ["administrator", "auditor", "super_admin"]);
    const rows = await db.execute<{ id: string; kind: string; day: string; rows: number; bytes: number; created_at: Date }>(sql`
      SELECT id, kind, day::text AS day, rows, bytes, created_at FROM data_archives
      WHERE organization_id = ${organizationId}
      ORDER BY day DESC, kind, created_at DESC
      LIMIT ${Math.min(Math.max(Number(limit) || 120, 1), 1000)}
    `);
    const { lastRunAt, report } = await lastMaintenanceReport();
    return {
      policy: retentionPolicy(),
      storage: archiveStore()?.name.split(":")[0] ?? null,
      lastRunAt,
      lastRunComplete: report?.complete ?? null,
      archives: rows.rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        day: r.day,
        rows: r.rows,
        bytes: r.bytes,
        createdAt: new Date(r.created_at).toISOString(),
      })),
    };
  }

  /** One archive file as CSV (opens in Excel) or the lossless gzip JSON Lines original. */
  @Get(":id")
  async download(
    @Param("id") id: string,
    @Query("format") format: string | undefined,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const { organizationId, actor } = await orgAccessFromRequest(req);
    requireRoles(actor, ["administrator", "auditor", "super_admin"]);
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new NotFoundException("not_found");
    const res = await db.execute<{ path: string; kind: string; day: string }>(sql`
      SELECT path, kind, day::text AS day FROM data_archives WHERE id = ${id} AND organization_id = ${organizationId}
    `);
    const row = res.rows[0];
    if (!row) throw new NotFoundException("not_found");
    if (!archiveStore()) throw new ForbiddenException("archive_not_configured");
    const records = await readArchive(row.path);
    const base = `techlio-${row.kind}-${row.day}`;
    if (format === "ndjson") {
      reply
        .header("Content-Type", "application/x-ndjson; charset=utf-8")
        .header("Content-Disposition", `attachment; filename="${base}.ndjson"`)
        .send(records.map((r) => JSON.stringify(r)).join("\n") + "\n");
      return;
    }
    const csv =
      row.kind === "events"
        ? eventsToCsv(records)
        : // Sessions: every column as-is.
          (() => {
            const cols = [...new Set(records.flatMap((r) => Object.keys(r)))];
            const cell = (v: unknown) => {
              if (v === undefined || v === null) return "";
              const s = typeof v === "string" ? v : JSON.stringify(v);
              return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
            };
            return [cols.join(","), ...records.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\r\n") + "\r\n";
          })();
    reply
      .header("Content-Type", "text/csv; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="${base}.csv"`)
      // BOM so Excel opens UTF-8 (names, workspaces) correctly.
      .send(`\uFEFF${csv}`);
  }
}
