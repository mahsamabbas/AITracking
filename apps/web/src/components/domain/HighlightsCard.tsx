import { Card, CardHeader } from "@/components/ui/Card";
import { IconChip } from "@/components/ui/Icon";
import type { Highlight } from "@/lib/insights";

/** "At a glance" facts for the period, beside the usage trend. */
export function HighlightsCard({ items }: { items: Highlight[] }) {
  return (
    <Card>
      <CardHeader
        icon="spark"
        tone="violet"
        title="Highlights"
        subtitle="What stood out in this period"
        help="Derived from the same tracked agent events as the charts. They describe AI activity, not how hard anyone worked."
      />
      {items.length === 0 ? (
        <p className="hint card-body p-5">Nothing stood out yet — highlights appear once agents report activity.</p>
      ) : (
        <ul className="card-body flex flex-col justify-around divide-y divide-line">
          {items.map((h) => (
            <li key={h.id} className="flex items-center gap-3 px-5 py-3">
              <IconChip name={h.icon} tone={h.tone} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="label">{h.label}</p>
                <p className="truncate text-sm font-semibold text-ink-900" title={h.value}>
                  {h.value}
                </p>
              </div>
              <p className="max-w-[45%] text-right text-2xs leading-snug text-ink-500">{h.detail}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
