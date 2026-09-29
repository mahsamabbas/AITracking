"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  CONNECTOR_MAC_PKG,
  CONNECTOR_WINDOWS_EXE,
  detectConnectorPlatform,
  useConnectorReach,
  type ConnectorReach,
} from "@/lib/connector-local";

/**
 * Shown when this page cannot reach the connector on 127.0.0.1. Names the
 * actual cause — the browser permission, a connector set up for another
 * address, or no connector — and gives the one action that fixes it.
 */
export function LocalAccessHint({ onReachable }: { onReachable?: () => void }) {
  const { reach, check } = useConnectorReach();
  const [checking, setChecking] = useState(false);
  const platform = detectConnectorPlatform();
  const site = typeof window !== "undefined" ? window.location.host : "this site";

  // Runs from a click, so the browser shows its permission prompt right away.
  async function retry() {
    setChecking(true);
    try {
      const r = await check();
      if (r === "ok") onReachable?.();
    } finally {
      setChecking(false);
    }
  }

  if (reach === null || reach === "ok") return null;

  const box = (tone: "warn" | "info", title: string, body: React.ReactNode, action?: React.ReactNode) => (
    <div
      role="status"
      className={`mt-3 rounded-lg border px-4 py-3 text-xs leading-relaxed ${
        tone === "warn"
          ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
          : "border-brand-200 bg-brand-50 text-ink-700"
      }`}
    >
      <p className="text-sm font-semibold">{title}</p>
      <div className="mt-1">{body}</div>
      {action ? <div className="mt-3 flex flex-wrap gap-2">{action}</div> : null}
    </div>
  );

  const retryButton = (label = "Check again") => (
    <Button type="button" variant="ghost" className="h-8 text-xs" loading={checking} loadingLabel="Checking…" onClick={() => void retry()}>
      {label}
    </Button>
  );

  const byReach: Record<Exclude<ConnectorReach, "ok">, React.ReactNode> = {
    "permission-prompt": box(
      "info",
      "Allow this page to connect to the connector",
      <>
        Your browser asks once before a website may talk to apps on this computer. Click the button below;
        when the browser asks whether <strong>{site}</strong> may access apps and services on this device,
        choose <strong>Allow</strong>. The page only talks to your Techlio connector (127.0.0.1) — nothing else.
      </>,
      <Button type="button" className="h-8 text-xs" loading={checking} loadingLabel="Waiting for Allow…" onClick={() => void retry()}>
        Connect to this computer
      </Button>,
    ),
    "permission-denied": box(
      "warn",
      "Your browser is blocking this page from the connector",
      <ol className="ml-4 list-decimal space-y-0.5">
        <li>Click the icon at the left end of the address bar (next to {site}).</li>
        <li>
          Open <strong>Site settings</strong> and set <strong>Local network access</strong> (called{" "}
          <em>Apps on device</em> in some versions) to <strong>Allow</strong>.
        </li>
        <li>Come back here and click Check again.</li>
      </ol>,
      retryButton(),
    ),
    "wrong-site": box(
      "warn",
      "The connector on this computer is set up for a different Techlio address",
      <>
        It is running, but it only accepts the dashboard it was installed from. Download the connector from this
        page and install it again — it replaces the old one in place; nothing needs to be uninstalled first.
      </>,
      <>
        <a
          href={platform === "windows" ? CONNECTOR_WINDOWS_EXE : CONNECTOR_MAC_PKG}
          download
          className="btn-primary inline-flex h-8 items-center px-3 text-xs"
        >
          Download again
        </a>
        {retryButton()}
      </>,
    ),
    "not-running": box(
      "warn",
      "No connector is answering on this computer",
      <>
        {platform === "mac"
          ? "Open the installer you downloaded and finish it. Afterwards the Techlio icon appears in the menu bar at the top of your screen."
          : platform === "windows"
            ? "Run the downloaded installer. Afterwards Techlio Connector appears in Task Manager → Background processes."
            : "Install the connector from this page."}{" "}
        If the connector is already running there, a privacy extension may be blocking this page: allow this site in it
        (Brave: turn Shields off for this site).
      </>,
      retryButton(),
    ),
  };
  return <>{byReach[reach]}</>;
}
