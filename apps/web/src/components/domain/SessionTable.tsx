"use client";

import { OrgLink } from "@/components/OrgLink";
import { useRouter } from "next/navigation";
import { useAppPaths } from "@/lib/app-paths";
import { useMemo, useState } from "react";
import { SortableTh, type SortDirection } from "@/components/ui/SortControl";
import { formatDateTime, formatDuration } from "@/lib/format";
import { sortSessions, type SessionSortKey } from "@/lib/sort-sessions";
import type { SessionRow } from "@/lib/types";
import { ClassificationBadge, CoverageBadge, ProviderBadge } from "./Badges";
import { EmptyState } from "@/components/ui/States";

export function SessionTable({
  sessions,
  projectNames,
  showProvider = true,
  emptyBody,
}: {
  sessions: SessionRow[];
  projectNames?: Record<string, string>;
  showProvider?: boolean;
  emptyBody?: string;
}) {
  const router = useRouter();
  const { resolvePath } = useAppPaths();
  const [sortKey, setSortKey] = useState<SessionSortKey>("startedAt");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");

  const sorted = useMemo(
    () => sortSessions(sessions, sortKey, sortDir),
    [sessions, sortKey, sortDir],
  );

  function onSort(key: SessionSortKey, direction: SortDirection) {
    setSortKey(key);
    setSortDir(direction);
  }

  // Projects are assigned by people, never by agents: show the column only
  // when some session in view actually has one.
  const showProject = sessions.some((s) => !s.unassigned);
  if (sessions.length === 0) {
    return <EmptyState compact variant="no-activity" body={emptyBody} />;
  }

  return (
    <div
      className={
        sessions.length > 6 ? "table-scroll min-h-0 overflow-x-auto" : "overflow-x-auto"
      }
    >
      <table className="tbl min-w-[720px]">
        <thead>
          <tr>
            <SortableTh
              label="Started"
              sortKey="startedAt"
              activeKey={sortKey}
              direction={sortDir}
              onSort={onSort}
              defaultDirection="desc"
            />
            {showProvider ? <th>AI tool</th> : null}
            {showProject ? <th>Project / work item</th> : null}
            <SortableTh
              label="Agent active"
              sortKey="activeDurationMs"
              activeKey={sortKey}
              direction={sortDir}
              onSort={onSort}
              align="right"
            />
            <SortableTh
              label="Session span"
              sortKey="elapsedSpanMs"
              activeKey={sortKey}
              direction={sortDir}
              onSort={onSort}
              align="right"
            />
            <SortableTh
              label="Model · Tools"
              sortKey="modelRequests"
              activeKey={sortKey}
              direction={sortDir}
              onSort={onSort}
              align="right"
            />
            <SortableTh
              label="Files & checks"
              sortKey="fileChanges"
              activeKey={sortKey}
              direction={sortDir}
              onSort={onSort}
              align="right"
            />
            <th>Session pattern</th>
            <th aria-label="Open" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((s) => (
            <tr
              key={s.id}
              className="row-link"
              onClick={() => router.push(resolvePath(`/sessions/${s.id}`))}
            >
              <td className="whitespace-nowrap">
                <span className="num text-sm text-ink-900">{formatDateTime(s.startedAt)}</span>
                <span className="hint block">
                  → {s.endedAt ? formatDateTime(s.endedAt).split(", ").pop() : "in progress"}
                </span>
              </td>
              {showProvider ? (
                <td>
                  <ProviderBadge provider={s.provider} size="sm" />
                </td>
              ) : null}
              {showProject ? (
                <td className="max-w-[220px]">
                  {s.unassigned ? (
                    <span className="hint">Not assigned</span>
                  ) : (
                    <span className="block truncate text-sm text-ink-700">
                      {projectNames?.[s.projectId ?? ""] ?? "Assigned"}
                    </span>
                  )}
                </td>
              ) : null}
              <td className="num whitespace-nowrap text-right font-medium">
                {formatDuration(s.activeDurationMs)}
              </td>
              <td className="num whitespace-nowrap text-right text-ink-500">
                {formatDuration(s.elapsedSpanMs)}
              </td>
              <td className="num whitespace-nowrap text-right text-ink-500">
                {s.modelRequests} · {s.toolCalls}
              </td>
              <td className="num whitespace-nowrap text-right text-ink-500">
                {s.fileChanges} files
                {s.testsRun > 0 ? (
                  <span className={s.testsFailed > 0 ? "block text-rose-600" : "block"}>
                    {s.testsRun} tests
                  </span>
                ) : null}
              </td>
              <td>
                <div className="flex flex-wrap gap-1">
                  <ClassificationBadge id={s.classification} />
                  <CoverageBadge state={s.coverageState} />
                </div>
              </td>
              <td className="text-right">
                <OrgLink
                  href={`/sessions/${s.id}`}
                  className="text-xs font-medium text-brand-600 hover:text-brand-700"
                  onClick={(e) => e.stopPropagation()}
                >
                  Open
                </OrgLink>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
