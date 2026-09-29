"use client";

import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "./api";
import { connectorOwner, forgetFailedConnectorScan, setConnectorViewer, setupConnectorFetch } from "./connector-local";

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
      signal: AbortSignal.timeout(8_000),
    });
    if (!r.ok) return false;
    const json = (await r.json()) as { connectors?: { state?: string }[] };
    return (json.connectors ?? []).some((c) => c.state === "online" || c.state === "paused");
  } catch {
    return false;
  }
}

type SettledPhase = Exclude<ConnectorSetupPhase, "loading">;

/**
 * One check at a time, shared by every caller (shell, gate, tour, stepper,
 * guide…): concurrent callers get the same promise, and a result younger than
 * FRESH_MS is reused. Each check probes up to 20 local ports and calls the
 * API, so uncoordinated pollers multiplied that per page.
 */
const FRESH_MS = 2_500;
let inflight: Promise<SettledPhase> | null = null;
let lastResult: { at: number; phase: SettledPhase } | null = null;
const phaseListeners = new Set<(phase: SettledPhase) => void>();
/**
 * Whether the last check found a connector on this computer, before the
 * server fallback. A recent heartbeat keeps the dashboard unlocked, but only
 * a local answer means it is installed here (null until the first check).
 */
let foundLocally: boolean | null = null;

export function connectorFoundLocally(): boolean | null {
  return foundLocally;
}

export function fetchConnectorSetupPhase(options: { force?: boolean } = {}): Promise<SettledPhase> {
  if (inflight) return inflight;
  if (!options.force && lastResult && Date.now() - lastResult.at < FRESH_MS) {
    return Promise.resolve(lastResult.phase);
  }
  if (options.force) forgetFailedConnectorScan();
  inflight = computeConnectorSetupPhase()
    .then((phase) => {
      lastResult = { at: Date.now(), phase };
      for (const listener of phaseListeners) listener(phase);
      return phase;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

async function computeConnectorSetupPhase(): Promise<SettledPhase> {
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
  if (phase === "offline" && !lastResult) {
    await sleep(450);
    phase = await attempt();
  }
  foundLocally = phase !== "offline";
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

/** Install steps — whenever no connector answers on this computer. */
export function showConnectorInstallStepper(phase: ConnectorSetupPhase, installedHere?: boolean | null): boolean {
  if (phase === "offline" || installedHere === false) return true;
  if (phase === "loading") return readCachedConnectorPhase() === "offline";
  return false;
}

/** Subscribers of the shared poller: id → requested interval. */
const pollers = new Map<number, number>();
let pollerSeq = 0;
let pollTimer: ReturnType<typeof setTimeout> | null = null;

function onVisible(): void {
  if (document.visibilityState === "visible") schedulePoll(0);
}

/** One timer for all subscribers (shortest interval wins); paused while the tab is hidden. */
function schedulePoll(delay?: number): void {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = null;
  if (pollers.size === 0) {
    document.removeEventListener("visibilitychange", onVisible);
    return;
  }
  document.addEventListener("visibilitychange", onVisible);
  const every = Math.min(...pollers.values());
  pollTimer = setTimeout(() => {
    if (document.visibilityState === "hidden") return; // resumes on visibilitychange
    void fetchConnectorSetupPhase().finally(() => schedulePoll());
  }, delay ?? every);
}

/**
 * Connector setup phase, kept current by the shared poller. `enabled: false`
 * (e.g. roles that never install a connector) makes no requests at all.
 */
export function useConnectorSetupPhase(pollMs = 5_000, enabled = true) {
  const [phase, setPhase] = useState<ConnectorSetupPhase>(() => initialConnectorSetupPhase());
  const [installedHere, setInstalledHere] = useState<boolean | null>(() => foundLocally);

  const apply = useCallback((next: SettledPhase) => {
    setPhase(next);
    setInstalledHere(foundLocally);
  }, []);

  const refresh = useCallback(async () => {
    const next = await fetchConnectorSetupPhase({ force: true });
    apply(next);
    return next;
  }, [apply]);

  useEffect(() => {
    if (!enabled) return;
    const id = ++pollerSeq;
    phaseListeners.add(apply);
    pollers.set(id, pollMs);
    void fetchConnectorSetupPhase().then(apply);
    schedulePoll();
    return () => {
      phaseListeners.delete(apply);
      pollers.delete(id);
      schedulePoll();
    };
  }, [enabled, pollMs, apply]);

  return { phase, installedHere, refresh };
}
