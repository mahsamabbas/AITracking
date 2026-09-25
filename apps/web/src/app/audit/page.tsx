"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, CardHeader } from "@/components/ui/Card";
import { TableScroll } from "@/components/ui/TableScroll";
import { Badge } from "@/components/ui/Badge";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/ui/States";
import { FilterBar, SearchFilter } from "@/components/filters/FilterBar";
import { useApi } from "@/lib/use-api";
import { formatDateTime } from "@/lib/format";

interface AuditEntry {
  id: string;
  actorId: string | null;
  action: string;
  detail: Record<string, unknown> | null;
  createdAt: string;
}

function toneFor(action: string): "ok" | "warn" | "bad" | "info" | "neutral" {
  if (action.includes("reject") || action.includes("revoke")) return "bad";
  if (action.includes("pause") || action.includes("gap")) return "warn";
  if (action.startsWith("auth")) return "info";
  if (action.includes("export") || action.includes("create")) return "ok";
  return "neutral";
}

export default function AuditPage() {
  const query = useApi<{ entries: AuditEntry[] }>("/v1/audit-log?limit=200");
  const [search, setSearch] = useState("");

  const entries = (query.data?.entries ?? []).filter((e) =>
    search
      ? e.action.toLowerCase().includes(search.toLowerCase()) ||
        JSON.stringify(e.detail ?? {}).toLowerCase().includes(search.toLowerCase())
      : true,
  );

  return (
    <AppShell
      title="Audit history"
      subtitle="Append-only record of logins, access, configuration, pauses, and exports"
    >
      <FilterBar>
        <SearchFilter
          value={search}
          onChange={setSearch}
          placeholder="Filter by action or detail…"
          width="w-[300px]"
        />
      </FilterBar>

      <Card className="card-table">
        <CardHeader icon="list" tone="slate"
          title="Events"
          subtitle={`${entries.length} entries · newest first`}
        />
        {query.error ? (
          <ErrorState
            title="Could not load the audit log"
            detail={
              query.status === 403
                ? "Only auditors and administrators can read the audit log."
                : query.error
            }
            onRetry={query.reload}
          />
        ) : query.loading ? (
          <LoadingBlock rows={8} />
        ) : entries.length === 0 ? (
          <EmptyState variant={search ? "no-results" : "no-activity"} />
        ) : (
          <TableScroll>
            <table className="tbl min-w-[640px]">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Action</th>
                  <th>Actor</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td className="num whitespace-nowrap text-sm text-ink-500">
                      {formatDateTime(e.createdAt)}
                    </td>
                    <td>
                      <Badge tone={toneFor(e.action)}>{e.action}</Badge>
                    </td>
                    <td className="num text-xs text-ink-400">
                      {e.actorId ? e.actorId.slice(0, 8) : "system"}
                    </td>
                    <td className="max-w-[420px]">
                      <code className="block truncate font-mono text-xs text-ink-500">
                        {e.detail ? JSON.stringify(e.detail) : "—"}
                      </code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Card>
    </AppShell>
  );
}
