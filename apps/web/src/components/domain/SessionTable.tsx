"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDateTime, formatDuration } from "@/lib/format";
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
            <th>Started</th>
            {showProvider ? <th>AI tool</th> : null}
            {showProject ? <th>Project / work item</th> : null}
            <th className="text-right">Agent active</th>
            <th className="text-right">Session span</th>
            <th className="text-right">Model · Tools</th>
            <th className="text-right">Output</th>
            <th>Activity</th>
            <th aria-label="Open" />
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => (
            <tr
              key={s.id}
              className="row-link"
              onClick={() => router.push(`/sessions/${s.id}`)}
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
                <Link
                  href={`/sessions/${s.id}`}
                  className="text-xs font-medium text-brand-600 hover:text-brand-700"
                  onClick={(e) => e.stopPropagation()}
                >
                  Open
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
