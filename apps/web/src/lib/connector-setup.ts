"use client";

import { useCallback, useEffect, useState } from "react";
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
  writeCachedConnectorPhase(phase);
  return phase;
}

/** Initial phase for hooks — optimistic "ready" avoids onboarding UI flash on reload. */
export function initialConnectorSetupPhase(): ConnectorSetupPhase {
  const cached = readCachedConnectorPhase();
  return cached ?? "loading";
}

/** Call before probing so the correct connector is selected on shared machines. */
export function syncConnectorViewer(developerId: string | null | undefined): void {
  setConnectorViewer(developerId);
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
