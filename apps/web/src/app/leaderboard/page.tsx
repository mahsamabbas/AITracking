"use client";

import { OrgLink } from "@/components/OrgLink";
import { useRouter } from "next/navigation";
import { useAppPaths } from "@/lib/app-paths";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, CardHeader } from "@/components/ui/Card";
import { TableScroll } from "@/components/ui/TableScroll";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/ui/States";
import { ProviderBadge } from "@/components/domain/Badges";
import { FilterBar, SelectFilter } from "@/components/filters/FilterBar";
import { ContextBar } from "@/components/ui/ContextBar";
import {
  RangePicker,
  rangeLabel,
  rangeParams,
  type RangeValue,
} from "@/components/filters/RangePicker";
import { useApi } from "@/lib/use-api";
import { analyticsPollMs } from "@/lib/live-poll";
import { useAuth } from "@/lib/auth-context";
import { qs } from "@/lib/api";
import { formatDuration, formatNumber, formatRelative, initialsOf } from "@/lib/format";
import type { FilterMeta } from "@/lib/types";
import { initialRangePreset } from "@/lib/preferences";

type SortKey =
  | "active"
  | "sessions"
  | "modelRequests"
  | "toolCalls"
  | "fileChanges"
  | "tokens"
  | "providerRequests";

interface LeaderboardRow {
  rank: number | null;
  id: string;
  displayName: string;
  team: string | null;
  title: string | null;
  activeMs: number;
  sessions: number;
  modelRequests: number;
  toolCalls: number;
  fileChanges: number;
  testsRun: number;
  buildsRun: number;
  tokenInput: number | null;
  tokenOutput: number | null;
  providerRequests: number | null;
  providers: string[];
  lastActiveAt: string | null;
}

const COLUMNS: { key: SortKey; label: string; title: string }[] = [
  { key: "active", label: "AI active time", title: "Merged model + tool time the agents were working" },
  { key: "sessions", label: "Sessions", title: "Agent sessions started in the range" },
  { key: "modelRequests", label: "Model calls", title: "Completed model requests (agent turns for tools without per-call timing)" },
  { key: "toolCalls", label: "Tool calls", title: "Completed agent tool calls" },
  { key: "fileChanges", label: "File changes", title: "Files the agents created, modified, or deleted" },
  { key: "tokens", label: "Tokens", title: "Input + output tokens, only where the provider reports them" },
  { key: "providerRequests", label: "Provider requests", title: "Daily requests reported by the provider's admin API (Cursor, Copilot)" },
];

export default function LeaderboardPage() {
  const router = useRouter();
  const { resolvePath } = useAppPaths();
  const { user } = useAuth();
  const allowed = user?.role === "administrator" || user?.role === "manager";
  const [range, setRange] = useState<RangeValue>(() => ({ preset: initialRangePreset("7d") }));
  const [team, setTeam] = useState("");
  const [provider, setProvider] = useState("");
  const [sort, setSort] = useState<SortKey>("active");

  const meta = useApi<FilterMeta>(allowed ? "/v1/meta/filters" : null);
  const query = useApi<{
    rows: LeaderboardRow[];
    summary: { listed: number; withActivity: number; activeMs: number; sessions: number };
  }>(
    allowed
      ? `/v1/leaderboard${qs({
          ...rangeParams(range),
          team: team || undefined,
          provider: provider || undefined,
          sort,
        })}`
      : null,
    { pollMs: analyticsPollMs(range) },
  );

  if (user && (!allowed || query.status === 403)) {
    return (
      <AppShell title="Leaderboard">
        <Card>
          <EmptyState
            variant="no-permission"
            action={
              <OrgLink href="/" className="btn-ghost">
                Back to overview
              </OrgLink>
            }
          />
        </Card>
      </AppShell>
    );
  }

  const rows = query.data?.rows ?? [];
  // Show only metrics some provider actually reported: Cursor sends no tokens,
  // and provider requests exist only when a Tier B report is configured.
  const hasTokens = rows.some((r) => r.tokenInput != null || r.tokenOutput != null);
  const hasProviderRequests = rows.some((r) => r.providerRequests != null);
  const columns = COLUMNS.filter(
    (c) => (c.key !== "tokens" || hasTokens) && (c.key !== "providerRequests" || hasProviderRequests),
  );
  const sortLabel = COLUMNS.find((c) => c.key === sort)?.label ?? "AI active time";

  return (
    <AppShell
      title="Leaderboard"
      subtitle={`AI usage per person, ranked by ${sortLabel.toLowerCase()} · ${rangeLabel(range)}`}
    >
      <ContextBar
        subject="Organisation · all employees"
        rangeLabel={rangeLabel(range)}
        fetchedAt={query.fetchedAt}
        refreshing={query.refreshing}
        onRefresh={() => {
          query.reload();
        }}
      />
      <FilterBar
        right={
          <SelectFilter
            label="Rank by"
            value={sort}
            onChange={(v) => setSort((v || "active") as SortKey)}
            allLabel="AI active time"
            width="w-full min-w-0 sm:w-[180px]"
            options={columns.filter((c) => c.key !== "active").map((c) => ({
              value: c.key,
              label: c.label,
            }))}
          />
        }
      >
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
          width="w-full min-w-0 sm:w-[170px]"
          options={(meta.data?.providers ?? []).map((p) => ({ value: p.id, label: p.label }))}
        />
      </FilterBar>

      <div className="mt-5">
        <Card className="card-table">
          <CardHeader icon="trophy" tone="amber"
            title="AI usage ranking"
            subtitle={
              query.data
                ? `${query.data.summary.withActivity} of ${query.data.summary.listed} people with observed AI activity · visible to administrators and managers only`
                : "Visible to administrators and managers only"
            }
            action={query.refreshing ? <span className="hint">Refreshing…</span> : null}
          />
          {query.error ? (
            <ErrorState title="Could not load the leaderboard" detail={query.error} onRetry={query.reload} />
          ) : query.loading ? (
            <LoadingBlock rows={8} />
          ) : rows.length === 0 ? (
            <EmptyState variant={team || provider ? "no-results" : "no-employees"} />
          ) : (
            <TableScroll>
              <table className="tbl min-w-[1100px]">
                <thead>
                  <tr>
                    <th className="w-14 text-right">#</th>
                    <th>Employee</th>
                    <th>AI tools</th>
                    {columns.map((c) => (
                      <th
                        key={c.key}
                        className="text-right"
                        title={c.title}
                        aria-sort={sort === c.key ? "descending" : "none"}
                      >
                        <button
                          type="button"
                          onClick={() => setSort(c.key)}
                          className={`inline-flex items-center gap-1 uppercase tracking-[0.06em] transition-colors duration-fast hover:text-ink-900 ${
                            sort === c.key ? "text-ink-900" : ""
                          }`}
                        >
                          {c.label}
                          <span aria-hidden className={sort === c.key ? "text-brand-600" : "text-ink-400 opacity-0"}>
                            ↓
                          </span>
                        </button>
                      </th>
                    ))}
                    <th>Last active</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    // Agent time in range counts even when the session started before it.
                    const tierA = r.sessions > 0 || r.activeMs > 0;
                    const tokens =
                      r.tokenInput == null && r.tokenOutput == null
                        ? null
                        : (r.tokenInput ?? 0) + (r.tokenOutput ?? 0);
                    return (
                      <tr key={r.id} className="row-link" onClick={() => router.push(resolvePath(`/employees/${r.id}`))}>
                        <td className="num text-right font-semibold text-ink-900">
                          {r.rank ?? <span className="hint font-normal">—</span>}
                        </td>
                        <td>
                          <div className="flex items-center gap-2.5">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-2xs font-semibold text-brand-700">
                              {initialsOf(r.displayName)}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-ink-900">{r.displayName}</p>
                              <p className="hint truncate">
                                {r.title ?? "—"} · {r.team ?? "No team"}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td>
                          {r.providers.length === 0 ? (
                            <span className="hint">None observed</span>
                          ) : (
                            <div className="flex flex-wrap items-center gap-1">
                              {r.providers.map((p) => (
                                <ProviderBadge key={p} provider={p} size="sm" />
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="num whitespace-nowrap text-right font-medium text-ink-900">
                          {tierA ? formatDuration(r.activeMs) : <span className="hint font-sans font-normal">No activity</span>}
                        </td>
                        <td className="num text-right text-ink-700">{tierA ? formatNumber(r.sessions) : "—"}</td>
                        <td className="num text-right text-ink-700">{tierA ? formatNumber(r.modelRequests) : "—"}</td>
                        <td className="num text-right text-ink-700">{tierA ? formatNumber(r.toolCalls) : "—"}</td>
                        <td className="num text-right text-ink-700">{tierA ? formatNumber(r.fileChanges) : "—"}</td>
                        {hasTokens ? (
                          <td
                            className="num whitespace-nowrap text-right text-ink-700"
                            title={tokens == null ? "This person's tools do not report tokens" : `${formatNumber(r.tokenInput)} in · ${formatNumber(r.tokenOutput)} out`}
                          >
                            {tokens == null ? "—" : formatNumber(tokens)}
                          </td>
                        ) : null}
                        {hasProviderRequests ? (
                          <td className="num text-right text-ink-700">
                            {r.providerRequests == null ? "—" : formatNumber(r.providerRequests)}
                          </td>
                        ) : null}
                        <td className="whitespace-nowrap text-sm text-ink-500">{formatRelative(r.lastActiveAt)}</td>
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
        Ranks describe observed AI agent usage only, not performance. People whose tools do not report
        a metric (e.g. Cursor sends no tokens) show “—” and rank after measured values. Planning,
        review, meetings, and manual coding are invisible to this system.
      </p>
    </AppShell>
  );
}
