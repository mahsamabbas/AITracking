import { Badge } from "@/components/ui/Badge";
import { CONNECTOR_STATE, classificationOf, type ConnectorState } from "@/lib/vocab";
import { providerMeta } from "@/lib/providers";

export function ConnectorBadge({ state }: { state: ConnectorState }) {
  const s = CONNECTOR_STATE[state] ?? CONNECTOR_STATE.offline;
  if (state === "online") {
    // The only pulsing element in the product: a live heartbeat.
    return (
      <span className="badge-ok" title={s.help}>
        <span className="pulse-online h-1.5 w-1.5 rounded-full bg-conn-ok" aria-hidden />
        {s.label}
      </span>
    );
  }
  return (
    <Badge tone={s.tone} dot title={s.help}>
      {s.label}
    </Badge>
  );
}

export function ClassificationBadge({ id }: { id: string }) {
  const c = classificationOf(id);
  return (
    <Badge tone={c.tone} title={c.help}>
      {c.label}
    </Badge>
  );
}

export function ProviderBadge({
  provider,
  size = "md",
}: {
  provider: string | null | undefined;
  size?: "sm" | "md";
}) {
  const meta = providerMeta(provider);
  const label = size === "sm" && meta.shortLabel ? meta.shortLabel : meta.label;
  const title =
    meta.note != null
      ? `${meta.label} — ${meta.note}`
      : meta.shortLabel && meta.shortLabel !== meta.label
        ? meta.label
        : undefined;
  return (
    <span
      className={`provider-badge inline-flex max-w-full shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full font-medium ring-1 ring-inset ring-black/5 dark:ring-white/10 ${
        size === "sm" ? "px-1.5 py-0.5 text-2xs" : "px-2 py-0.5 text-xs"
      }`}
      style={
        {
          "--provider-bg": meta.soft,
          "--provider-fg": meta.ink,
          "--provider-dot": meta.color,
        } as React.CSSProperties
      }
      title={title}
    >
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: meta.color }}
        aria-hidden
      />
      <span className="truncate">{label}</span>
    </span>
  );
}

export function CoverageBadge({ state }: { state: string }) {
  if (state === "complete") return null;
  return (
    <Badge
      tone="warn"
      title="Telemetry for this session is incomplete. Missing data is not evidence of inactivity."
    >
      {state === "gap" ? "Coverage gap" : "Partial telemetry"}
    </Badge>
  );
}
