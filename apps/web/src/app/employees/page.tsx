"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, CardHeader } from "@/components/ui/Card";
import { TableScroll } from "@/components/ui/TableScroll";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/ui/States";
import { Sparkline } from "@/components/charts/Sparkline";
import { ConnectorBadge, ProviderBadge } from "@/components/domain/Badges";
import { UserAvatar } from "@/components/UserAvatar";
import {
  ActiveFilters,
  FilterBar,
  SearchFilter,
  SelectFilter,
} from "@/components/filters/FilterBar";
import { ContextBar } from "@/components/ui/ContextBar";
import {
  RangePicker,
  rangeLabel,
  rangeParams,
  type RangeValue,
} from "@/components/filters/RangePicker";
import { useApi } from "@/lib/use-api";
import { useAppPaths } from "@/lib/app-paths";
import { qs } from "@/lib/api";
import { formatDuration, formatRelative } from "@/lib/format";
import { providerLabel } from "@/lib/providers";
import { SortableTh, type SortDirection } from "@/components/ui/SortControl";
import type { EmployeeRow, FilterMeta } from "@/lib/types";

type SortKey = "activity" | "sessions" | "recent" | "name";

const SORTS: { value: SortKey; label: string }[] = [
  { value: "activity", label: "Most AI usage" },
  { value: "sessions", label: "Most sessions" },
  { value: "recent", label: "Recently active" },
  { value: "name", label: "Name (A–Z)" },
];

const CONNECTOR_STATES = [
  { value: "online", label: "Online" },
  { value: "stale", label: "Stale" },
  { value: "paused", label: "Paused" },
  { value: "offline", label: "Offline" },
];

export default function EmployeesPage() {
  const router = useRouter();
  const { resolvePath } = useAppPaths();
  const [range, setRange] = useState<RangeValue>({ preset: "7d" });
  const [search, setSearch] = useState("");
  const [team, setTeam] = useState("");
  const [provider, setProvider] = useState("");
  const [connectorState, setConnectorState] = useState("");
  const [sort, setSort] = useState<SortKey>("activity");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");

  const meta = useApi<FilterMeta>("/v1/meta/filters");
  const query = useApi<{
    employees: EmployeeRow[];
    summary?: {
      listed: number;
      withActivity: number;
      activeMs: number;
      sessions: number;
      coverageWarnings: number;
    };
  }>(
    `/v1/employees${qs({
      ...rangeParams(range),
      search: search || undefined,
      team: team || undefined,
      provider: provider || undefined,
      connectorState: connectorState || undefined,
      sort,
    })}`,
  );

  const rows = query.data?.employees ?? [];

  const displayedRows = useMemo(() => {
    const copy = [...rows];
    const mul = sortDir === "asc" ? 1 : -1;
    copy.sort((a, b) => {
      let cmp = 0;
      if (sort === "name") cmp = a.displayName.localeCompare(b.displayName);
      else if (sort === "sessions") cmp = a.sessions - b.sessions;
      else if (sort === "recent") {
        cmp =
          new Date(a.lastActiveAt ?? 0).getTime() - new Date(b.lastActiveAt ?? 0).getTime();
      } else cmp = a.activeMs - b.activeMs;
      return mul * cmp;
    });
    return copy;
  }, [rows, sort, sortDir]);

  function onColumnSort(key: SortKey, direction: SortDirection) {
    setSort(key);
    setSortDir(direction);
  }

  const defaultDir = (key: SortKey): SortDirection => (key === "name" ? "asc" : "desc");

  const chips = [
    search ? { label: `Search: ${search}`, onRemove: () => setSearch("") } : null,
    team ? { label: `Team: ${team}`, onRemove: () => setTeam("") } : null,
    provider
      ? { label: `Tool: ${providerLabel(provider)}`, onRemove: () => setProvider("") }
      : null,
    connectorState
      ? { label: `Connector: ${connectorState}`, onRemove: () => setConnectorState("") }
      : null,
  ].filter(Boolean) as { label: string; onRemove: () => void }[];

  const clearAll = () => {
    setSearch("");
    setTeam("");
    setProvider("");
    setConnectorState("");
  };

  return (
    <AppShell
      title="Employees"
      subtitle={`AI tool usage per person · ${rangeLabel(range)}`}
    >
      <ContextBar
        subject={"Organisation · all employees"}
        rangeLabel={rangeLabel(range)}
        fetchedAt={query.fetchedAt}
        refreshing={query.refreshing}
        onRefresh={() => { query.reload() }}
      />
      <FilterBar
        right={
          <SelectFilter
            label="Sort"
            value={sort}
            onChange={(v) => setSort((v || "activity") as SortKey)}
            allLabel="Most AI usage"
            width="w-[170px]"
            options={SORTS.filter((s) => s.value !== "activity").map((s) => ({
              value: s.value,
              label: s.label,
            }))}
          />
        }
      >
        <SearchFilter
          value={search}
          onChange={setSearch}
          placeholder="Search name, email, team…"
        />
        <RangePicker value={range} onChange={setRange} />
        <SelectFilter
          label="Team"
          value={team}
          onChange={setTeam}
          allLabel="All teams"
          options={(meta.data?.teams ?? []).map((t) => ({ value: t, label: t }))}
        />
        <SelectFilter
          label="AI tool"
          value={provider}
          onChange={setProvider}
          allLabel="All AI tools"
          width="w-[170px]"
          options={(meta.data?.providers ?? []).map((p) => ({ value: p.id, label: p.label }))}
        />
        <div className="seg" role="radiogroup" aria-label="Connector state">
          {[{ value: "", label: "All" }, ...CONNECTOR_STATES].map((o) => (
            <button
              key={o.value || "all"}
              type="button"
              role="radio"
              aria-checked={connectorState === o.value}
              className={connectorState === o.value ? "seg-item-on" : "seg-item"}
              onClick={() => setConnectorState(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </FilterBar>

      <ActiveFilters chips={chips} onClear={clearAll} />

      <div className="mt-5">
        <Card className="card-table">
          <CardHeader icon="people"
            title="Directory"
            subtitle={`${rows.length} people · open a row for full analytics · totals for the range are on Organisation overview`}
            action={
              query.refreshing ? <span className="hint">Refreshing…</span> : null
            }
          />
          {query.error ? (
            <ErrorState
              title="Could not load the directory"
              detail={query.error}
              onRetry={query.reload}
            />
          ) : query.loading ? (
            <LoadingBlock rows={6} />
          ) : rows.length === 0 ? (
            <EmptyState
              variant={chips.length > 0 ? "no-results" : "no-employees"}
              action={
                chips.length > 0 ? (
                  <button type="button" className="btn-ghost" onClick={clearAll}>
                    Clear filters
                  </button>
                ) : null
              }
            />
          ) : (
            <TableScroll>
              <table className="tbl min-w-[960px]">
                <thead>
                  <tr>
                    <SortableTh
                      label="Employee"
                      sortKey="name"
                      activeKey={sort}
                      direction={sortDir}
                      onSort={onColumnSort}
                      defaultDirection={defaultDir("name")}
                    />
                    <th>Connector</th>
                    <th>AI tools used</th>
                    <SortableTh
                      label="AI active time"
                      sortKey="activity"
                      activeKey={sort}
                      direction={sortDir}
                      onSort={onColumnSort}
                      align="right"
                      defaultDirection={defaultDir("activity")}
                    />
                    <th className="text-right" title="Idle time inside working periods (same measure as the Workday graph)">
                      Idle
                    </th>
                    <SortableTh
                      label="Sessions"
                      sortKey="sessions"
                      activeKey={sort}
                      direction={sortDir}
                      onSort={onColumnSort}
                      align="right"
                      defaultDirection={defaultDir("sessions")}
                    />
                    <th className="text-right">Avg session</th>
                    <th>Trend</th>
                    <SortableTh
                      label="Last active"
                      sortKey="recent"
                      activeKey={sort}
                      direction={sortDir}
                      onSort={onColumnSort}
                      defaultDirection={defaultDir("recent")}
                    />
                    <th className="text-right">This hour</th>
                    <th aria-label="Open" />
                  </tr>
                </thead>
                <tbody>
                  {displayedRows.map((r) => {
                    return (
                      <tr
                        key={r.id}
                        className="row-link"
                        onClick={() => router.push(`/employees/${r.id}`)}
                      >
                        <td>
                          <div className="flex items-center gap-2.5">
                            <UserAvatar name={r.displayName} src={r.avatarUrl} size="sm" />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-ink-900">
                                {r.displayName}
                              </p>
                              <p className="hint truncate">
                                {r.title ?? "—"} · {r.team ?? "No team"}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td>
                          <ConnectorBadge state={r.connectorState} />
                        </td>
                        <td>
                          {r.tools.length === 0 ? (
                            <span className="hint">None observed</span>
                          ) : (
                            <div className="flex flex-wrap items-center gap-1">
                              {r.tools.slice(0, 3).map((t) => (
                                <ProviderBadge key={t.provider} provider={t.provider} size="sm" />
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="num whitespace-nowrap text-right font-medium text-ink-900">
                          {r.sessions === 0 ? (
                            <span className="hint font-sans font-normal">No activity</span>
                          ) : (
                            formatDuration(r.activeMs)
                          )}
                        </td>
                        <td className="whitespace-nowrap text-right">
                          {r.activeMs === 0 ? (
                            <span className="hint">—</span>
                          ) : (
                            <span className="num text-sm text-ink-700">{formatDuration(r.idleMs)}</span>
                          )}
                        </td>
                        <td className="num text-right text-ink-700">{r.sessions || "—"}</td>
                        <td className="num text-right text-ink-500">
                          {r.sessions ? formatDuration(r.avgSessionMs) : "—"}
                        </td>
                        <td>
                          <Sparkline points={r.trend.map((p) => p.activeMs)} />
                        </td>
                        <td className="whitespace-nowrap text-sm text-ink-500">
                          {formatRelative(r.lastActiveAt)}
                        </td>
                        <td
                          className="num text-right text-ink-700"
                          title={
                            r.coverageWarning && r.currentHourEvents === 0
                              ? "No events this hour, and the connector is not fully online. This is not shown as zero activity."
                              : "Events recorded in the current clock hour"
                          }
                        >
                          {r.coverageWarning && r.currentHourEvents === 0
                            ? "—"
                            : r.currentHourEvents}
                        </td>
                        <td className="text-right">
                          <Link
                            href={resolvePath(`/employees/${r.id}`)}
                            className="text-xs font-medium text-brand-600 hover:text-brand-700"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Open
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableScroll>
          )}
        </Card>
      </div>

      <p className="mt-4 text-2xs leading-relaxed text-ink-400">
        Times describe observed agent activity only. Idle is time inside a working period with
        no agent running. Low AI usage is not evidence of low effort — planning, review,
        meetings, and manual coding are invisible to this system.
      </p>
    </AppShell>
  );
}
