import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import { archiveStore } from "./archive-store.js";
import { FULL_EVENT_SQL } from "./payload.js";
import { DAY_MS, dayKey } from "./policy.js";

/**
 * Archive files: gzip-compressed JSON Lines (one complete record per line),
 * one file per organisation, kind, and UTC day — e.g.
 *   <org>/events/2026/09/2026-09-14.ndjson.gz
 * Lossless (every field, re-importable), ~15x smaller than the rows, and
 * convertible to CSV/Excel on download. A file is only recorded once it was
 * read back and its checksum matched.
 */

export type ArchiveKind = "events" | "sessions";

export interface ArchiveRecord {
  path: string;
  rows: number;
  bytes: number;
  sha256: string;
}

function pathFor(organizationId: string, kind: ArchiveKind, day: Date, part?: string): string {
  const key = dayKey(day);
  return `${organizationId}/${kind}/${key.slice(0, 4)}/${key.slice(5, 7)}/${key}${part ? `.${part}` : ""}.ndjson.gz`;
}

async function writeVerified(
  organizationId: string,
  kind: ArchiveKind,
  day: Date,
  lines: unknown[],
  part?: string,
): Promise<ArchiveRecord> {
  const store = archiveStore();
  if (!store) throw new Error("archive_not_configured");
  // Nothing happened that day: record nothing (the day is still marked archived).
  if (lines.length === 0) return { path: "", rows: 0, bytes: 0, sha256: "" };
  const body = gzipSync(Buffer.from(lines.map((l) => JSON.stringify(l)).join("\n") + (lines.length ? "\n" : ""), "utf8"), {
    level: 9,
  });
  const sha256 = createHash("sha256").update(body).digest("hex");
  const path = pathFor(organizationId, kind, day, part);
  await store.put(path, body, "application/gzip");
  const back = await store.get(path);
  if (!back || createHash("sha256").update(back).digest("hex") !== sha256) {
    throw new Error(`archive verification failed for ${path}`);
  }
  await db.execute(sql`
    INSERT INTO data_archives (organization_id, kind, day, path, rows, bytes, sha256)
    VALUES (${organizationId}, ${kind}, ${dayKey(day)}::date, ${path}, ${lines.length}, ${body.length}, ${sha256})
    ON CONFLICT (path) DO UPDATE SET rows = EXCLUDED.rows, bytes = EXCLUDED.bytes, sha256 = EXCLUDED.sha256, created_at = NOW()
  `);
  return { path, rows: lines.length, bytes: body.length, sha256 };
}

/**
 * Every event of one UTC day that is still in the database (all types, so
 * the archive is complete). `part` names a supplementary file for events that
 * arrived after the day was already archived.
 */
export async function archiveEventsDay(organizationId: string, day: Date, part?: string): Promise<ArchiveRecord> {
  const res = await db.execute<{ event: Record<string, unknown> }>(sql`
    SELECT ${sql.raw(FULL_EVENT_SQL("e"))} AS event
    FROM activity_events e
    WHERE e.organization_id = ${organizationId}
      AND e.occurred_at >= ${day} AND e.occurred_at < ${new Date(day.getTime() + DAY_MS)}
    ORDER BY e.occurred_at, e.event_id
  `);
  return writeVerified(organizationId, "events", day, res.rows.map((r) => r.event), part);
}

/** Sessions that started on one UTC day (summary rows, before they are removed). */
export async function archiveSessionsDay(organizationId: string, day: Date): Promise<ArchiveRecord> {
  const res = await db.execute<{ session: Record<string, unknown> }>(sql`
    SELECT to_jsonb(s.*) AS session
    FROM agent_sessions s
    WHERE s.organization_id = ${organizationId}
      AND s.started_at >= ${day} AND s.started_at < ${new Date(day.getTime() + DAY_MS)}
    ORDER BY s.started_at, s.id
  `);
  return writeVerified(organizationId, "sessions", day, res.rows.map((r) => r.session));
}

/** Records of one archive file (for downloads and re-imports). */
export async function readArchive(path: string): Promise<Record<string, unknown>[]> {
  const store = archiveStore();
  if (!store) throw new Error("archive_not_configured");
  const body = await store.get(path);
  if (!body) throw new Error("archive_not_found");
  return gunzipSync(body)
    .toString("utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

/** CSV (opens in Excel) with the fields people report on; nested metadata as JSON. */
export function eventsToCsv(events: Record<string, unknown>[]): string {
  const cols = [
    "occurred_at",
    "received_at",
    "event_type",
    "provider",
    "developer_id",
    "device_id",
    "session_id",
    "duration_ms",
    "status",
    "tool_name",
    "tool_category",
    "model_name",
    "path_category",
    "event_id",
    "metadata",
  ];
  const cell = (v: unknown) => {
    if (v === undefined || v === null) return "";
    const s = typeof v === "string" ? v : JSON.stringify(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.join(",")];
  for (const e of events) {
    const m = (e.metadata ?? {}) as Record<string, unknown>;
    lines.push(
      cols
        .map((c) => (c === "metadata" ? cell(e.metadata) : c in e ? cell(e[c]) : cell(m[c])))
        .join(","),
    );
  }
  return lines.join("\r\n") + "\r\n";
}
