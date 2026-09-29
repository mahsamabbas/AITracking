"use client";

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: string; count?: number }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div role="tablist" className="seg w-full sm:w-auto">
      {tabs.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(t.id)}
            className={`${active ? "seg-item-on" : "seg-item"} px-3.5 py-2 text-sm`}
          >
            {t.label}
            {t.count !== undefined ? (
              <span className={`num ml-1.5 text-xs ${active ? "text-white/80" : "text-ink-400"}`}>{t.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
