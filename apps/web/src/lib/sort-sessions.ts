import type { SortDirection } from "@/components/ui/SortControl";
import type { SessionRow } from "@/lib/types";

export type SessionSortKey =
  | "startedAt"
  | "activeDurationMs"
  | "elapsedSpanMs"
  | "modelRequests"
  | "fileChanges";

export function sortSessions(
  sessions: SessionRow[],
  key: SessionSortKey,
  direction: SortDirection,
): SessionRow[] {
  const mul = direction === "asc" ? 1 : -1;
  return [...sessions].sort((a, b) => {
    let cmp = 0;
    switch (key) {
      case "startedAt":
        cmp = new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime();
        break;
      case "activeDurationMs":
        cmp = a.activeDurationMs - b.activeDurationMs;
        break;
      case "elapsedSpanMs":
        cmp = a.elapsedSpanMs - b.elapsedSpanMs;
        break;
      case "modelRequests":
        cmp = a.modelRequests + a.toolCalls - (b.modelRequests + b.toolCalls);
        break;
      case "fileChanges":
        cmp = a.fileChanges - b.fileChanges;
        break;
      default:
        cmp = 0;
    }
    if (cmp !== 0) return mul * cmp;
    return a.id.localeCompare(b.id);
  });
}
