import { InfoDot } from "@/components/ui/InfoDot";

export interface Metric {
  label: string;
  value: string;
  help?: string;
  unavailable?: boolean;
}

export function MetricGrid({ metrics, columns = 4 }: { metrics: Metric[]; columns?: 3 | 4 | 5 }) {
  const cols =
    columns === 3
      ? "sm:grid-cols-2 lg:grid-cols-3"
      : columns === 5
        ? "sm:grid-cols-3 lg:grid-cols-5"
        : "sm:grid-cols-2 lg:grid-cols-4";
  return (
    <dl className={`grid grid-cols-1 gap-px overflow-hidden rounded-lg bg-line ${cols}`}>
      {/* A metric the provider does not send is left out, never shown as a placeholder. */}
      {metrics.filter((m) => !m.unavailable).map((m) => (
        <div key={m.label} className="bg-card px-4 py-3">
          <dt className="flex items-center gap-1.5">
            <span className="label">{m.label}</span>
            {m.help ? <InfoDot text={m.help} /> : null}
          </dt>
          <dd className="num mt-1 text-[15px] font-semibold text-ink-900">
            {m.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
