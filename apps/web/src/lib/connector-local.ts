"use client";

import { useCallback, useEffect, useState } from "react";

export const CONNECTOR_LOCAL = "http://127.0.0.1:9477";
export const CONNECTOR_WINDOWS_EXE = "/downloads/techlio-connector-win-x64.exe";
/** Installer package: sets the connector up as a background LaunchAgent (no app, no Dock icon). */
export const CONNECTOR_MAC_PKG = "/downloads/techlio-connector-macos.pkg";
export const CONNECTOR_MAC_ARM = "/downloads/techlio-connector-macos-arm64.pkg";
export const CONNECTOR_MAC_INTEL = "/downloads/techlio-connector-macos-x64.pkg";

export function connectorDownloadPath(platform: "mac" | "windows" | "other"): string {
  if (platform === "windows") return CONNECTOR_WINDOWS_EXE;
  return CONNECTOR_MAC_PKG;
}

export async function fetchConnectorHealth(): Promise<boolean> {
  try {
    const r = await fetch(`${CONNECTOR_LOCAL}/health`, {
      method: "GET",
      cache: "no-store",
    });
    return r.ok;
  } catch {
    return false;
  }
}

export function useConnectorOnline(pollMs = 8_000): {
  online: boolean | null;
  refresh: () => Promise<void>;
} {
  const [online, setOnline] = useState<boolean | null>(null);

  const refresh = useCallback(async () => {
    setOnline(await fetchConnectorHealth());
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), pollMs);
    return () => clearInterval(t);
  }, [refresh, pollMs]);

  return { online, refresh };
}

export function useConnectorSetupPhase(pollMs = 5_000) {
  const [phase, setPhase] = useState<
    import("./connector-setup").ConnectorSetupPhase
  >("loading");

  const refresh = useCallback(async () => {
    const { fetchConnectorSetupPhase } = await import("./connector-setup");
    setPhase(await fetchConnectorSetupPhase());
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), pollMs);
    return () => clearInterval(t);
  }, [refresh, pollMs]);

  return { phase, refresh };
}

export function detectConnectorPlatform(): "mac" | "windows" | "other" {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/Win/i.test(ua)) return "windows";
  if (/Mac|iPhone|iPad/i.test(ua)) return "mac";
  return "other";
}

export function detectMacChip(): "arm" | "intel" {
  if (typeof navigator === "undefined") return "arm";
  const ua = navigator.userAgent;
  if (/Intel/i.test(ua)) return "intel";
  return "arm";
}
