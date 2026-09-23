"use client";

import { detectConnectorPlatform, useLocalAccess } from "@/lib/connector-local";

/**
 * Shown when this page cannot reach the connector on 127.0.0.1. Separates
 * "the browser blocked the check" from "the connector is not installed", which
 * look identical to the page.
 */
export function LocalAccessHint() {
  const access = useLocalAccess();
  const platform = detectConnectorPlatform();
  const tray =
    platform === "mac"
      ? "the Techlio icon in the menu bar at the top of your screen"
      : "Techlio Connector in Task Manager → Background processes";

  if (access === "denied") {
    return (
      <p className="mt-2 text-xs leading-relaxed text-amber-800 dark:text-amber-200">
        <strong>Your browser is blocking this page from reaching the connector.</strong> Click the
        icon to the left of the address bar → Site settings → <em>Local network access</em> (or
        <em> Apps on device</em>) → Allow, then reload this page.
      </p>
    );
  }
  if (access === "prompt") {
    return (
      <p className="mt-2 text-xs leading-relaxed text-amber-800 dark:text-amber-200">
        When your browser asks to let this site access apps or devices on this computer, choose{" "}
        <strong>Allow</strong>. The dashboard only talks to your Techlio connector on this computer (127.0.0.1).
      </p>
    );
  }
  return (
    <p className="mt-2 text-xs leading-relaxed text-ink-700">
      Check {tray}. If it shows the connector running, your browser or an ad blocker is stopping
      this page from reaching it: allow this site in the blocker (Brave: turn Shields off for this
      site), or use Chrome, Edge, or Safari.
    </p>
  );
}
