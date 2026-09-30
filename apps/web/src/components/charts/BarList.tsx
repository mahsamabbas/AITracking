export interface BarItem {
  label: string;
  value: number;
  formatted: string;
  meta?: string;
  color?: string;
}

/** Ranked horizontal bars — clearer than a pie for "top N" comparisons. */
export function BarList({ items, emptyLabel = "No data in this period" }: {
  items: BarItem[];
  emptyLabel?: string;
}) {
  const max = Math.max(...items.map((i) => i.value), 1);
  if (items.length === 0) {
    return <p className="hint py-6 text-center">{emptyLabel}</p>;
  }
  return (
    <ul className={`space-y-2.5 ${items.length > 8 ? "scroll-y-sm pr-1" : ""}`}>
      {items.map((item) => {
        const inner = (
          <>
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="truncate text-sm text-ink-900">{item.label}</span>
              <span className="num shrink-0 text-xs font-medium text-ink-700">
                {item.formatted}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(2, (item.value / max) * 100)}%`,
                  background: item.color ?? "var(--chart-1)",
                }}
              />
            </div>
            {item.meta ? <p className="hint mt-1">{item.meta}</p> : null}
          </>
        );
        return <li key={item.label}>{inner}</li>;
      })}
    </ul>
  );
}
