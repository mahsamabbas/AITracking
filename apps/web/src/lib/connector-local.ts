"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Each OS user on a computer runs their own connector on one of these ports
 * (the connector records its port per user). The page must talk to the
 * signed-in person's connector — never another profile's on the same machine.
 */
export const CONNECTOR_PORTS = Array.from({ length: 10 }, (_, i) => 9477 + i);
/** Default address, used only for copy and when nothing has been found yet. */
export const CONNECTOR_LOCAL = "http://127.0.0.1:9477";

let viewerDeveloperId: string | null = null;
let cachedBase: string | null = null;

/** Called by the auth provider so discovery knows whose connector to pick. */
export function setConnectorViewer(developerId: string | null | undefined): void {
  if ((developerId ?? null) !== viewerDeveloperId) cachedBase = null;
  viewerDeveloperId = developerId ?? null;
}

type LocalIdentity = { paired?: boolean; developerId?: string; displayName?: string };

/**
 * Whose connector this is, from the signed-in person's point of view.
 * "other": activated for a different account — e.g. a key from before the
 * database moved, or a previous user of this computer. It can be re-activated
 * with the viewer's own key, but is never paused, stopped, or unpaired for them.
 */
export type ConnectorOwner = "mine" | "unpaired" | "other";

export function connectorOwner(id: LocalIdentity): ConnectorOwner {
  if (!id.paired) return "unpaired";
  return !viewerDeveloperId || id.developerId === viewerDeveloperId ? "mine" : "other";
}

async function probe(base: string): Promise<LocalIdentity | null> {
  try {
    const r = await fetch(`${base}/identity`, { cache: "no-store", signal: AbortSignal.timeout(1_500) });
    return r.ok ? ((await r.json()) as LocalIdentity) : null;
  } catch {
    return null;
  }
}

/** Mine: paired to the signed-in developer, or not yet activated (ready to pair). */
function isMine(id: LocalIdentity): boolean {
  return connectorOwner(id) !== "other";
}

let cachedSetupBase: string | null = null;

/**
 * A full scan that found nothing is remembered briefly: with no connector
 * installed every caller would otherwise probe all ports on every tick.
 * Cleared by a user action ("Check again", Connect) via forgetFailedConnectorScan.
 */
const FAILED_SCAN_TTL_MS = 10_000;
let failedScanAt = 0;
let failedSetupScanAt = 0;

export function forgetFailedConnectorScan(): void {
  failedScanAt = 0;
  failedSetupScanAt = 0;
}

/** Run `fn` once for concurrent callers, and reuse its result for `freshMs`. */
function shared<T>(fn: () => Promise<T>, freshMs: number): (force?: boolean) => Promise<T> {
  let inflight: Promise<T> | null = null;
  let last: { at: number; value: T } | null = null;
  return (force = false) => {
    if (inflight) return inflight;
    if (!force && last && Date.now() - last.at < freshMs) return Promise.resolve(last.value);
    inflight = fn()
      .then((value) => {
        last = { at: Date.now(), value };
        return value;
      })
      .finally(() => {
        inflight = null;
      });
    return inflight;
  };
}

/** Poll `run` every `ms` while the tab is visible; re-check as soon as it becomes visible again. */
function useVisiblePoll(run: () => void, ms: number): void {
  useEffect(() => {
    run();
    const tick = () => {
      if (document.visibilityState === "visible") run();
    };
    const t = setInterval(tick, ms);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [run, ms]);
}

/**
 * The base URL of this person's connector on this computer, or null. A
 * connector paired to someone else is never used. When several are found,
 * one already paired to this person wins over an unactivated one.
 */
export async function connectorBase(): Promise<string | null> {
  if (cachedBase) {
    const id = await probe(cachedBase);
    if (id && isMine(id) && (id.paired || !viewerDeveloperId)) return cachedBase;
  }
  if (Date.now() - failedScanAt < FAILED_SCAN_TTL_MS) return null;
  const found = await Promise.all(
    CONNECTOR_PORTS.map(async (port) => {
      const base = `http://127.0.0.1:${port}`;
      return { base, id: await probe(base) };
    }),
  );
  const mine = found.filter((f): f is { base: string; id: LocalIdentity } => f.id != null && isMine(f.id));
  const pick = mine.find((f) => f.id.paired) ?? mine[0];
  cachedBase = pick?.base ?? null;
  // Remember "nothing of mine here" only if nothing answered at all (a
  // connector of another account still needs the setup path to find it).
  failedScanAt = cachedBase || found.some((f) => f.id) ? 0 : Date.now();
  return cachedBase;
}

/**
 * For detection and activation only: this person's connector if there is one,
 * else any connector on this computer (one activated for another account can
 * be switched to this person by activating their own admin-issued key).
 */
export async function setupConnectorBase(): Promise<string | null> {
  const own = await connectorBase();
  if (own) return own;
  if (cachedSetupBase && (await probe(cachedSetupBase))) return cachedSetupBase;
  if (Date.now() - failedSetupScanAt < FAILED_SCAN_TTL_MS) return null;
  const found = await Promise.all(
    CONNECTOR_PORTS.map(async (port) => {
      const base = `http://127.0.0.1:${port}`;
      return (await probe(base)) ? base : null;
    }),
  );
  cachedSetupBase = found.find(Boolean) ?? null;
  failedSetupScanAt = cachedSetupBase ? 0 : Date.now();
  return cachedSetupBase;
}

/** Detection / activation fetch: may reach a connector activated for another account. */
export async function setupConnectorFetch(path: string, init?: RequestInit): Promise<Response> {
  const base = await setupConnectorBase();
  if (!base) throw new Error("connector_not_found");
  return fetch(`${base}${path}`, { cache: "no-store", ...init });
}

/** Fetch against this person's connector; throws when none is reachable. */
export async function connectorFetch(path: string, init?: RequestInit): Promise<Response> {
  const base = await connectorBase();
  if (!base) throw new Error("connector_not_found");
  return fetch(`${base}${path}`, { cache: "no-store", ...init });
}
export const CONNECTOR_WINDOWS_EXE = "/downloads/techlio-connector-win-x64.exe";
/** Installer package: sets the connector up as a background LaunchAgent (no app, no Dock icon). */
export const CONNECTOR_MAC_PKG = "/downloads/techlio-connector-macos.pkg";

const sharedHealth = shared(async () => {
  try {
    const r = await setupConnectorFetch("/health");
    return r.ok;
  } catch {
    return false;
  }
}, 2_500);

export function fetchConnectorHealth(force = false): Promise<boolean> {
  if (force) forgetFailedConnectorScan();
  return sharedHealth(force);
}

export function useConnectorOnline(pollMs = 8_000): {
  online: boolean | null;
  refresh: () => Promise<void>;
} {
  const [online, setOnline] = useState<boolean | null>(null);

  const poll = useCallback(() => {
    void fetchConnectorHealth().then(setOnline);
  }, []);
  // User-initiated ("Check if running"): always a fresh scan.
  const refresh = useCallback(async () => {
    setOnline(await fetchConnectorHealth(true));
  }, []);

  useVisiblePoll(poll, pollMs);

  return { online, refresh };
}

export { connectorFoundLocally, showConnectorInstallStepper, useConnectorSetupPhase } from "./connector-setup";

export function detectConnectorPlatform(): "mac" | "windows" | "other" {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/Win/i.test(ua)) return "windows";
  if (/Mac|iPhone|iPad/i.test(ua)) return "mac";
  return "other";
}

/**
 * Chrome/Edge 142+ ask before a website may call apps on this device
 * (127.0.0.1). A denied or unanswered prompt makes every connector check fail
 * even though the connector is running, so the UI must say which it is.
 * Permission names changed across releases; the first one the browser knows wins.
 */
export type LocalAccess = "granted" | "prompt" | "denied" | "unknown";

export async function localAccessState(): Promise<LocalAccess> {
  if (typeof navigator === "undefined" || !navigator.permissions) return "unknown";
  for (const name of ["loopback-network", "local-network-access", "local-network"]) {
    try {
      const status = await navigator.permissions.query({ name } as unknown as PermissionDescriptor);
      return status.state as LocalAccess;
    } catch {
      /* this browser does not know that permission name */
    }
  }
  return "unknown";
}

/**
 * Why this page can or cannot reach the connector — each cause needs a
 * different fix, and to the page they otherwise all look like "not detected".
 *   ok                 reachable (the dashboard can activate/pause it)
 *   permission-prompt  the browser is waiting for the person to click Allow
 *   permission-denied  "Local network access" was blocked for this site
 *   wrong-site         a connector answers but was set up for another Techlio address
 *   not-running        nothing answers on this computer
 */
export type ConnectorReach = "ok" | "permission-prompt" | "permission-denied" | "wrong-site" | "not-running";

const sharedDiagnosis = shared(diagnoseConnectorNow, 2_500);

export function diagnoseConnector(force = false): Promise<ConnectorReach> {
  if (force) forgetFailedConnectorScan();
  return sharedDiagnosis(force);
}

async function diagnoseConnectorNow(): Promise<ConnectorReach> {
  if (await setupConnectorBase()) return "ok";
  const access = await localAccessState();
  if (access === "denied") return "permission-denied";
  if (access === "prompt") return "permission-prompt";
  // An opaque (no-cors) request succeeds whenever something answered, even if
  // the connector refused this site — that separates "wrong site" from "off".
  const answered = await Promise.all(
    CONNECTOR_PORTS.map((port) =>
      fetch(`http://127.0.0.1:${port}/health`, { mode: "no-cors", cache: "no-store", signal: AbortSignal.timeout(1_500) })
        .then(() => true)
        .catch(() => false),
    ),
  );
  return answered.some(Boolean) ? "wrong-site" : "not-running";
}

export function useConnectorReach(pollMs = 6_000): { reach: ConnectorReach | null; check: () => Promise<ConnectorReach> } {
  const [reach, setReach] = useState<ConnectorReach | null>(null);
  const poll = useCallback(() => {
    void diagnoseConnector().then(setReach);
  }, []);
  // From a click: fresh, and runs inside the gesture so the browser can prompt.
  const check = useCallback(async () => {
    const r = await diagnoseConnector(true);
    setReach(r);
    return r;
  }, []);
  useVisiblePoll(poll, pollMs);
  return { reach, check };
}
