export type ConnectorState = "online" | "stale" | "paused" | "offline";

export const STALE_MS = 5 * 60 * 1000;

export function connectorStateOf(
  paused: number | null | undefined,
  lastHeartbeat: Date | string | null | undefined,
  now = Date.now(),
): ConnectorState {
  if (paused === 1) return "paused";
  if (!lastHeartbeat) return "offline";
  const at =
    lastHeartbeat instanceof Date
      ? lastHeartbeat.getTime()
      : new Date(lastHeartbeat).getTime();
  return now - at > STALE_MS ? "stale" : "online";
}

/**
 * Person-level badge: a live collector wins. A second device that is offline
 * must not make the whole person look disconnected (that hid real Cursor
 * heartbeats behind a seeded Claude device). Coverage warnings stay separate.
 */
export function rollupConnectorState(input: {
  paused: number | null;
  lastHeartbeat: Date | null;
  anyOffline: boolean | null;
  anyStale: boolean | null;
  anyOnline: boolean | null;
  hasDevices: boolean;
}): ConnectorState {
  if (!input.hasDevices) return "offline";
  if (input.anyOnline) return "online";
  if (input.paused === 1) return "paused";
  if (input.anyStale) return "stale";
  if (input.anyOffline) return "offline";
  return connectorStateOf(input.paused, input.lastHeartbeat);
}

/** Empty activity in a date range is not the same as "the collector is down". */
export function emptyActivityVariant(
  connectors: { state: ConnectorState }[],
): "no-activity" | "paused" | "connector-offline" {
  const pool = connectors;
  if (pool.some((c) => c.state === "online" || c.state === "stale")) {
    return "no-activity";
  }
  if (pool.some((c) => c.state === "paused")) return "paused";
  return "connector-offline";
}
