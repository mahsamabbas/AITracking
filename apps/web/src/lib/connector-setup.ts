"use client";

import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "./api";
import { connectorOwner, setConnectorViewer, setupConnectorFetch } from "./connector-local";

/** Routes developers may use until the local agent is installed and paired. */
export const CONNECTOR_ONBOARDING_PATHS = [
  "/setup-connector",
  "/my-connectors",
  "/policy",
  "/settings",
] as const;

export type ConnectorSetupPhase = "loading" | "offline" | "unpaired" | "ready";

const PHASE_CACHE_KEY = "techlio-connector-phase-v1";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function readCachedConnectorPhase(): Exclude<ConnectorSetupPhase, "loading"> | null {
  if (typeof window === "undefined") return null;
  try {
    const v = sessionStorage.getItem(PHASE_CACHE_KEY);
    if (v === "ready" || v === "offline" || v === "unpaired") return v;
  } catch {
    /* private mode */
  }
  return null;
}

function writeCachedConnectorPhase(phase: Exclude<ConnectorSetupPhase, "loading">): void {
  try {
    sessionStorage.setItem(PHASE_CACHE_KEY, phase);
  } catch {
    /* ignore */
  }
}

export function developerNeedsLocalConnector(
  role?: string | null,
  developerId?: string | null,
): boolean {
  return role === "developer" && Boolean(developerId);
}

export function isConnectorOnboardingPath(pathname: string): boolean {
  return CONNECTOR_ONBOARDING_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

let viewerToken: string | null = null;

/**
 * Server-side truth: does this person have a connector that sent a heartbeat
 * in the last few minutes (online, or paused on purpose)? Independent of the
 * browser — a missed "Allow" prompt or an ad blocker must never make a
 * running, tracking connector look uninstalled.
 */
async function connectorReportingToServer(): Promise<boolean> {
  if (!viewerToken) return false;
  try {
    const r = await fetch(`${API_BASE}/v1/dashboard/live?limit=1`, {
      headers: { Authorization: `Bearer ${viewerToken}` },
      cache: "no-store",
    });
    if (!r.ok) return false;
    const json = (await r.json()) as { connectors?: { state?: string }[] };
    return (json.connectors ?? []).some((c) => c.state === "online" || c.state === "paused");
  } catch {
    return false;
  }
}

export async function fetchConnectorSetupPhase(): Promise<
  Exclude<ConnectorSetupPhase, "loading">
> {
  const attempt = async (): Promise<Exclude<ConnectorSetupPhase, "loading">> => {
    try {
      const health = await setupConnectorFetch("/health");
      if (!health.ok) return "offline";
      const r = await setupConnectorFetch("/identity");
      if (!r.ok) return "offline";
      const json = (await r.json()) as { paired?: boolean; developerId?: string };
      // Activated for another account (e.g. a key from before a database move):
      // installed and running, but this person still has to activate their key.
      return connectorOwner(json) === "mine" ? "ready" : "unpaired";
    } catch {
      return "offline";
    }
  };

  let phase = await attempt();
  // First probe after reload is often false "offline" before localhost / viewer id settles.
  if (phase === "offline") {
    await sleep(450);
    phase = await attempt();
  }
  // The browser cannot reach it, but the connector is reporting: it is
  // installed, activated, and tracking — do not lock the dashboard.
  if (phase === "offline" && (await connectorReportingToServer())) phase = "ready";
  writeCachedConnectorPhase(phase);
  return phase;
}

/** Initial phase for hooks — optimistic "ready" avoids onboarding UI flash on reload. */
export function initialConnectorSetupPhase(): ConnectorSetupPhase {
  const cached = readCachedConnectorPhase();
  return cached ?? "loading";
}

/** Call before probing so the correct connector is selected on shared machines. */
export function syncConnectorViewer(developerId: string | null | undefined, token?: string | null): void {
  setConnectorViewer(developerId);
  if (token !== undefined) viewerToken = token;
}

export function connectorOnboardingActive(
  phase: ConnectorSetupPhase,
): boolean {
  return phase === "offline" || phase === "unpaired";
}

/** Install stepper on My connectors — only while the local agent is not running yet. */
export function showConnectorInstallStepper(phase: ConnectorSetupPhase): boolean {
  if (phase === "offline") return true;
  if (phase === "loading") return readCachedConnectorPhase() === "offline";
  return false;
}

export function useConnectorSetupPhase(pollMs = 5_000) {
  const [phase, setPhase] = useState<ConnectorSetupPhase>(() => initialConnectorSetupPhase());

  const refresh = useCallback(async () => {
    setPhase(await fetchConnectorSetupPhase());
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), pollMs);
    return () => clearInterval(t);
  }, [refresh, pollMs]);

  return { phase, refresh };
}
