import { Card, CardHeader } from "@/components/ui/Card";
import { AlertList, type AlertItem } from "@/components/domain/AlertList";
import { formatNumber } from "@/lib/format";
import type { CoverageSummary, LiveConnector } from "@/lib/types";

const STATES = [
  { key: "online", label: "Online", color: "rgb(var(--state-ok))" },
  { key: "stale", label: "Stale", color: "rgb(var(--state-warn))" },
  { key: "paused", label: "Paused", color: "var(--chart-3)" },
  { key: "offline", label: "Offline", color: "rgb(var(--state-idle))" },
] as const;

/**
 * Is the data trustworthy? Connector states right now, data-quality counts
 * for the range, and the live health notices — in one place.
 */
export function ConnectorHealthCard({
  connectors,
  coverage,
  alerts,
}: {
  connectors: LiveConnector[];
  coverage: CoverageSummary;
  alerts: AlertItem[];
}) {
  const counts = Object.fromEntries(STATES.map((s) => [s.key, connectors.filter((c) => c.state === s.key).length])) as Record<
    (typeof STATES)[number]["key"],
    number
  >;
  const total = connectors.length;
  const quality = [
    { label: "Gap events", value: coverage.gapEvents },
    { label: "Partial sessions", value: coverage.partialSessions },
    { label: "Unassigned sessions", value: coverage.unassignedSessions },
    { label: "No telemetry", value: coverage.employeesWithoutTelemetry },
  ];

  return (
    <Card>
      <CardHeader
        icon="shield"
        tone="teal"
        title="Data coverage & connector health"
        subtitle="Can these numbers be trusted? Connector states now, data quality for this range"
        help="A coverage gap means the system cannot confirm what happened — it never means the person was idle."
        href="/connectors"
        hrefLabel="Connectors"
      />
      <div className="card-body grid gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="border-b border-line p-5 lg:border-b-0 lg:border-r">
          <div className="flex items-baseline justify-between">
            <p className="label">Connectors</p>
            <p className="num text-xs text-ink-500">
              <span className="font-semibold text-ink-900">{counts.online}</span> of {total} online
            </p>
          </div>
          <div className="mt-2 flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/10" role="img" aria-label={STATES.map((s) => `${counts[s.key]} ${s.label.toLowerCase()}`).join(", ")}>
            {total > 0
              ? STATES.map((s) =>
                  counts[s.key] ? (
                    <span key={s.key} className="h-full" style={{ width: `${(counts[s.key] / total) * 100}%`, background: s.color }} />
                  ) : null,
                )
              : null}
          </div>
          <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
            {STATES.map((s) => (
              <li key={s.key} className="flex items-center gap-1.5 text-xs text-ink-700">
                <span className="h-2 w-2 rounded-full" style={{ background: s.color }} aria-hidden />
                {s.label}
                <span className="num ml-auto font-semibold text-ink-900 sm:ml-1">{counts[s.key]}</span>
              </li>
            ))}
          </ul>
          <div className="mt-5 grid grid-cols-2 gap-3">
            {quality.map((q) => (
              <div key={q.label} className="rounded-lg border border-line bg-raised px-3 py-2">
                <p className="label">{q.label}</p>
                <p className={`num mt-0.5 text-base font-semibold ${q.value > 0 ? "text-amber-700 dark:text-amber-300" : "text-ink-900"}`}>
                  {formatNumber(q.value)}
                </p>
              </div>
            ))}
          </div>
        </div>
        <div className="min-w-0">
          <p className="label px-5 pb-1 pt-5">Needs attention</p>
          <AlertList alerts={alerts} limit={8} />
        </div>
      </div>
    </Card>
  );
}
