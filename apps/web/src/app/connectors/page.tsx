"use client";

import { OrgLink } from "@/components/OrgLink";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, CardHeader } from "@/components/ui/Card";
import { TableScroll } from "@/components/ui/TableScroll";
import { StatTile } from "@/components/ui/StatTile";
import { Callout } from "@/components/ui/Callout";
import { EmptyState, ErrorState, LoadingBlock, StatSkeleton } from "@/components/ui/States";
import { ConnectorBadge, ProviderBadge } from "@/components/domain/Badges";
import { ThisComputerStatus } from "@/components/domain/ConnectThisComputer";
import { AlertList } from "@/components/domain/AlertList";
import { SelectFilter, FilterBar, SearchFilter } from "@/components/filters/FilterBar";
import { useApi } from "@/lib/use-api";
import { useAuth } from "@/lib/auth-context";
import { apiPost } from "@/lib/api";
import { formatRelative } from "@/lib/format";
import { canManageConnectors } from "@/lib/permissions";
import type { LiveStatus } from "@/lib/types";

export default function ConnectorsPage() {
  const { token, user } = useAuth();
  const query = useApi<LiveStatus>("/v1/dashboard/live?limit=1", { pollMs: 30_000 });
  const [search, setSearch] = useState("");
  const [state, setState] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const canManage = canManageConnectors(user?.role);
  const all = query.data?.connectors ?? [];
  const rows = all.filter((c) => {
    if (state && c.state !== state) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        c.displayName.toLowerCase().includes(q) ||
        (c.team ?? "").toLowerCase().includes(q) ||
        (c.provider ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const counts = {
    online: all.filter((c) => c.state === "online").length,
    stale: all.filter((c) => c.state === "stale").length,
    paused: all.filter((c) => c.state === "paused").length,
    offline: all.filter((c) => c.state === "offline").length,
  };

  async function toggle(deviceId: string, paused: boolean) {
    setBusy(deviceId);
    setNotice(null);
    try {
      await apiPost(`/v1/connectors/${deviceId}/${paused ? "resume" : "pause"}`, token);
      setNotice(
        paused
          ? "Collection resumed. The coverage gap remains visible in the timeline."
          : "Collection paused. A coverage gap event was recorded.",
      );
      query.reload();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not update the connector");
    } finally {
      setBusy(null);
    }
  }

  async function revoke(deviceId: string) {
    setBusy(deviceId);
    try {
      await apiPost<{ revoked?: boolean }>(`/v1/connectors/${deviceId}/revoke`, token, {});
      setNotice("Credential revoked. The connector can no longer upload events.");
      query.reload();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not revoke the credential");
    } finally {
      setBusy(null);
    }
  }

  return (
    <AppShell
      title="Connector health"
      subtitle="Registered installations, heartbeat freshness, queue depth, and coverage"
    >
      {notice ? (
        <div className="mb-5">
          <Callout tone="info" title={notice} />
        </div>
      ) : null}

      <div className="mb-5">
        <ThisComputerStatus />
      </div>

      {query.loading ? (
        <StatSkeleton />
      ) : (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile label="Online" icon="live" value={counts.online} hint="heartbeat within 5 min" accent="teal" />
          <StatTile label="Stale" icon="clock" value={counts.stale} hint="no heartbeat for 5+ min" accent="amber" />
          <StatTile label="Paused" icon="plug" value={counts.paused} hint="collection paused by policy" accent="amber" />
          <StatTile label="Offline" icon="shield" value={counts.offline} hint="never reported" accent="rose" />
        </section>
      )}

      <div className="mt-5">
        <FilterBar>
          <SearchFilter value={search} onChange={setSearch} placeholder="Search employee or tool…" />
          <SelectFilter
            label="State"
            value={state}
            onChange={setState}
            allLabel="Any state"
            width="w-[150px]"
            options={[
              { value: "online", label: "Online" },
              { value: "stale", label: "Stale" },
              { value: "paused", label: "Paused" },
              { value: "offline", label: "Offline" },
            ]}
          />
        </FilterBar>
      </div>

      <Card className="card-table">
        <CardHeader icon="plug" tone="teal"
          title="Registered connectors"
          subtitle="One credential per employee, device, and AI tool"
        />
        {query.error ? (
          <ErrorState title="Could not load connectors" detail={query.error} onRetry={query.reload} />
        ) : query.loading ? (
          <LoadingBlock rows={6} />
        ) : rows.length === 0 ? (
          <EmptyState variant={all.length === 0 ? "connector-offline" : "no-results"} />
        ) : (
          <TableScroll>
            <table className="tbl min-w-[720px]">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>AI tool</th>
                  <th>State</th>
                  <th>Last heartbeat</th>
                  <th className="text-right">Queue depth</th>
                  <th>Version</th>
                  {canManage ? <th aria-label="Actions" /> : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.deviceId}>
                    <td>
                      <OrgLink
                        href={`/employees/${c.developerId}`}
                        className="text-sm font-medium text-ink-900 hover:text-brand-600"
                      >
                        {c.displayName}
                      </OrgLink>
                      <span className="hint block">{c.team ?? "No team"}</span>
                    </td>
                    <td>
                      <ProviderBadge provider={c.provider} size="sm" />
                    </td>
                    <td>
                      <ConnectorBadge state={c.state} />
                    </td>
                    <td className="num text-sm text-ink-500">{formatRelative(c.lastHeartbeat)}</td>
                    <td className="num text-right text-sm text-ink-500">{c.queueDepth ?? "—"}</td>
                    <td className="num text-sm text-ink-500">{c.connectorVersion ?? "—"}</td>
                    {canManage ? (
                      <td className="text-right">
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            className="btn-ghost h-8 text-xs"
                            disabled={busy === c.deviceId}
                            onClick={() => void toggle(c.deviceId, c.paused)}
                          >
                            {c.paused ? "Resume" : "Pause"}
                          </button>
                          <button
                            type="button"
                            className="btn-ghost h-8 text-xs text-rose-700"
                            disabled={busy === c.deviceId}
                            onClick={() => void revoke(c.deviceId)}
                          >
                            Revoke
                          </button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Card>

      <div className="mt-5">
        <Card>
          <CardHeader icon="shield" tone="amber" title="Coverage notices" subtitle="Health and data-quality alerts only" />
          <AlertList alerts={query.data?.alerts ?? []} limit={10} />
        </Card>
      </div>

      <p className="mt-4 text-2xs leading-relaxed text-ink-400">
        Pausing collection creates a visible coverage gap rather than silently removing data.
        A paused or offline connector is never interpreted as developer inactivity.
      </p>
    </AppShell>
  );
}
