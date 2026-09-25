type Tone = "info" | "warn" | "bad";

const STYLES: Record<Tone, string> = {
  // Dark mode flips the brand scale: 50–200 are surfaces, 700–900 are light text.
  info: "border-brand-200 bg-brand-50 text-brand-900 dark:border-brand-400/50 dark:bg-brand-100 dark:text-brand-900",
  warn: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100",
  bad: "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-100",
};

export function Callout({
  tone = "info",
  title,
  children,
  action,
}: {
  tone?: Tone;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className={`flex flex-wrap items-start gap-3 rounded-xl border px-4 py-3 ${STYLES[tone]}`}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        {children ? <div className="mt-0.5 text-xs leading-relaxed opacity-90">{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
