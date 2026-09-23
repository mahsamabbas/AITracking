import Link from "next/link";
import { EmptyState } from "@/components/ui/States";

export interface AlertItem {
  severity: "info" | "warning" | "error";
  code: string;
  message: string;
  developerId?: string;
  displayName?: string;
}

const TONE: Record<string, string> = {
  info: "bg-brand-500",
  warning: "bg-amber-500",
  error: "bg-rose-500",
};

/** FR-027 — health and data-quality notices, never activity judgements. */
export function AlertList({ alerts, limit }: { alerts: AlertItem[]; limit?: number }) {
  if (alerts.length === 0) {
    return (
      <EmptyState
        compact
        title="No coverage warnings"
        body="Every connector in scope is reporting on schedule."
      />
    );
  }
  const rows = limit != null ? alerts.slice(0, limit) : alerts;
  return (
    <ul aria-live="polite" className={`divide-y divide-line ${rows.length > 5 ? "scroll-y-sm" : ""}`}>
      {rows.map((a, i) => (
        <li key={`${a.code}-${i}`} className="flex items-start gap-3 px-5 py-3">
          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TONE[a.severity]}`} />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-ink-900">{a.message}</p>
            <p className="hint mt-0.5">{a.code.replace(/_/g, " ")}</p>
          </div>
          {a.developerId ? (
            <Link
              href={`/employees/${a.developerId}`}
              className="shrink-0 text-xs font-medium text-brand-600 hover:text-brand-700"
            >
              View
            </Link>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
