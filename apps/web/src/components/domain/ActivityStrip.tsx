import { Icon, type IconName } from "@/components/ui/Icon";
import { formatNumber } from "@/lib/format";
import type { CommitSummary, Totals } from "@/lib/types";

interface StripItem {
  label: string;
  value: string;
  icon: IconName;
}

/**
 * What the agents did, as counts: calls, file changes, commits, shipped, and
 * tokens (or tests/builds, or sessions) — whichever the agents reported.
 */
export function ActivityStrip({ totals: t, commits }: { totals: Totals; commits?: CommitSummary | null }) {
  const items: StripItem[] = [
    { label: "Model calls", value: formatNumber(t.modelRequests), icon: "model" },
    { label: "Tool calls", value: formatNumber(t.toolCalls), icon: "tool" },
    { label: "File changes", value: formatNumber(t.fileChanges), icon: "file" },
    // No commit data (AI-tool view, or it could not be loaded) is "—", never a made-up 0.
    { label: "Commits", value: commits ? formatNumber(commits.commits) : "—", icon: "commit" },
    {
      label: "Shipped",
      value: !commits
        ? "—"
        : commits.commits
          ? `${formatNumber(commits.shipped)} · ${Math.round((commits.shipped / commits.commits) * 100)}%`
          : "0",
      icon: "ship",
    },
    // Tokens and checks appear only when an agent reported them.
    t.tokenInput != null
      ? { label: "Tokens in / out", value: `${formatNumber(t.tokenInput)} / ${formatNumber(t.tokenOutput)}`, icon: "bolt" }
      : t.testsRun + t.buildsRun > 0
        ? { label: "Tests · builds", value: `${formatNumber(t.testsRun)} · ${formatNumber(t.buildsRun)}`, icon: "target" }
        : { label: "Sessions", value: formatNumber(t.sessions), icon: "sessions" },
  ];
  return (
    <section
      aria-label="Agent activity counts"
      className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line shadow-card sm:grid-cols-3 lg:grid-cols-6"
    >
      {items.map((x) => (
        <div key={x.label} className="flex items-center gap-3 bg-card px-4 py-3">
          <Icon name={x.icon} className="hidden h-4 w-4 shrink-0 text-ink-400 sm:block" />
          <div className="min-w-0">
            <p className="label truncate">{x.label}</p>
            <p className="num mt-0.5 truncate text-base font-semibold text-ink-900">{x.value}</p>
          </div>
        </div>
      ))}
    </section>
  );
}
