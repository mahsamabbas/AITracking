"use client";

import { OrgLink } from "@/components/OrgLink";
import { formatRelative } from "@/lib/format";
import { providerLabel } from "@/lib/providers";
import type { LiveStatus } from "@/lib/types";

/**
 * The last step of onboarding: after the connector is online, wait for the
 * first real agent event and say so plainly. Driven entirely by
 * /v1/dashboard/live (already polled by the page) — nothing is simulated.
 */
export function FirstActivityStatus({
  live,
  developerId,
}: {
  live: LiveStatus | null;
  developerId?: string | null;
}) {
  if (!live || !developerId) return null;
  const mine = live.connectors.filter((c) => c.developerId === developerId);
  if (mine.length === 0) return null;

  const reporting = mine.some((c) => c.state === "online");
  const paused = mine.some((c) => c.paused);
  const session = live.activeSessions.find((s) => s.developerId === developerId);

  let tone = "border-line bg-card";
  let title: string;
  let body: React.ReactNode;

  if (session) {
    tone = "border-teal-200 bg-teal-50 dark:border-teal-900 dark:bg-teal-950/40";
    title = "Receiving activity";
    body = (
      <>
        Last agent event from {providerLabel(session.provider)}{" "}
        {formatRelative(session.lastEventAt ?? session.startedAt)}.{" "}
        <OrgLink href={`/employees/${developerId}`} className="font-medium text-brand-600 hover:text-brand-700">
          See your activity →
        </OrgLink>
      </>
    );
  } else if (paused) {
    tone = "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40";
    title = "Collection is paused";
    body = "Nothing is reported while paused, and the gap is recorded as a pause — not as inactivity. Resume below when you are ready.";
  } else if (reporting) {
    title = "Connected — waiting for your first agent event";
    body = "Open Claude Code or Cursor on this computer and send one prompt. It appears here within a minute; this page checks every 15 seconds.";
  } else {
    return null;
  }

  return (
    <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${tone}`} role="status" aria-live="polite">
      <span className="mt-1.5 flex h-2 w-2 shrink-0">
        <span
          className={`h-2 w-2 rounded-full ${
            session ? "pulse-online bg-conn-ok" : paused ? "bg-conn-warn" : "bg-brand-500 motion-safe:animate-pulse"
          }`}
          aria-hidden
        />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink-900">{title}</p>
        <p className="hint mt-0.5">{body}</p>
      </div>
    </div>
  );
}
