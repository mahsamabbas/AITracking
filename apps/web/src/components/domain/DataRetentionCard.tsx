"use client";

import { useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Callout } from "@/components/ui/Callout";
import { LoadingBlock } from "@/components/ui/States";
import { apiDownload } from "@/lib/api";
import { formatDate, formatNumber, formatRelative } from "@/lib/format";
import { useApi } from "@/lib/use-api";

interface ArchiveList {
  policy: { rawEventDays: number; sessionDays: number; auditDays: number; exportDays: number };
  storage: string | null;
  lastRunAt: string | null;
  lastRunComplete: boolean | null;
  archives: { id: string; kind: "events" | "sessions"; day: string; rows: number; bytes: number; createdAt: string }[];
}

const kb = (b: number) => (b >= 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/**
 * How long data stays in the database, and the archive of everything older —
 * downloadable per day as CSV (Excel) or the lossless JSON original.
 */
export function DataRetentionCard({ token }: { token: string | null }) {
  const q = useApi<ArchiveList>("/v1/archives?limit=180");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function download(id: string, day: string, kind: string, format: "csv" | "ndjson") {
    setBusy(`${id}:${format}`);
    setError(null);
    try {
      await apiDownload(`/v1/archives/${id}?format=${format}`, token, `techlio-${kind}-${day}.${format}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setBusy(null);
    }
  }

  const d = q.data;
  return (
    <Card>
      <CardHeader
        icon="repo"
        tone="sky"
        title="Data retention & archive"
        subtitle="Detailed events stay in the database for a short window; everything older is summarised for the charts and archived here"
      />
      <CardBody className="space-y-5">
        {q.loading ? <LoadingBlock /> : null}
        {q.error ? <Callout tone="bad" title="Could not load the archive">{q.error}</Callout> : null}
        {d ? (
          <>
            <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ["Detailed events", `${d.policy.rawEventDays} days`, "Then summarised, archived, and removed from the database"],
                ["Hourly summaries", "Kept", "Every chart and report for any past range"],
                ["Session records", `${d.policy.sessionDays} days`, "Then archived with the day they started"],
                ["Last maintenance", d.lastRunAt ? formatRelative(d.lastRunAt) : "Not run yet", d.lastRunComplete === false ? "Stopped at its time limit — continues next night" : "Runs nightly at 02:30"],
              ].map(([label, value, hint]) => (
                <div key={label} className="rounded-lg border border-line bg-raised px-4 py-3">
                  <dt className="label">{label}</dt>
                  <dd className="mt-1 text-base font-semibold text-ink-900">{value}</dd>
                  <dd className="hint mt-0.5">{hint}</dd>
                </div>
              ))}
            </dl>

            {!d.storage ? (
              <Callout tone="warn" title="Archive storage is not configured">
                Older days are summarised so charts keep working, but their detailed events stay in the database until
                archive storage is set up (SUPABASE_URL and SUPABASE_SECRET_KEY on the API).
              </Callout>
            ) : null}
            {error ? <Callout tone="bad" title="Download failed">{error}</Callout> : null}

            {d.archives.length === 0 ? (
              <p className="hint">
                No archives yet. The first days are archived once they are older than {d.policy.rawEventDays} days.
              </p>
            ) : (
              <div className="table-scroll rounded-lg border border-line">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Day (UTC)</th>
                      <th>Contents</th>
                      <th className="text-right">Records</th>
                      <th className="text-right">Size</th>
                      <th className="text-right">Download</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.archives.map((a) => (
                      <tr key={a.id}>
                        <td className="num whitespace-nowrap text-sm">{formatDate(`${a.day}T12:00:00Z`)}</td>
                        <td className="text-sm text-ink-700">{a.kind === "events" ? "Agent events" : "Sessions"}</td>
                        <td className="num text-right text-sm">{formatNumber(a.rows)}</td>
                        <td className="num text-right text-sm text-ink-500">{kb(a.bytes)}</td>
                        <td className="whitespace-nowrap text-right">
                          <button
                            type="button"
                            className="btn-ghost h-8 px-2.5 text-xs"
                            disabled={busy !== null}
                            onClick={() => void download(a.id, a.day, a.kind, "csv")}
                          >
                            {busy === `${a.id}:csv` ? "…" : "CSV"}
                          </button>
                          <button
                            type="button"
                            className="btn-quiet ml-1 h-8 text-xs"
                            disabled={busy !== null}
                            title="Lossless original (JSON Lines), for re-import or analysis"
                            onClick={() => void download(a.id, a.day, a.kind, "ndjson")}
                          >
                            {busy === `${a.id}:ndjson` ? "…" : "JSON"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : null}
      </CardBody>
    </Card>
  );
}
