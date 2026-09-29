import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { isKnownProvider, providerLabel } from "@techlio/event-schema";
import { db } from "./db.js";
import { devAffordancesEnabled } from "./runtime.js";
import { auditLog, connectorHealth, devices } from "./schema.js";
import { DEV_DEVELOPER_ALEX, DEV_ORG } from "./users.js";

export async function writeAudit(input: {
  organizationId: string;
  actorId?: string | null;
  action: string;
  detail?: unknown;
}): Promise<void> {
  await db.insert(auditLog).values({
    organizationId: input.organizationId,
    actorId: input.actorId ?? null,
    action: input.action,
    detail: input.detail ?? null,
    createdAt: new Date(),
  });
}

export async function setConnectorPaused(input: {
  deviceId: string;
  organizationId: string;
  provider: string | null;
  paused: boolean;
}): Promise<void> {
  const pausedFlag = input.paused ? 1 : 0;
  await db
    .insert(connectorHealth)
    .values({
      deviceId: input.deviceId,
      organizationId: input.organizationId,
      paused: pausedFlag,
      remotePaused: pausedFlag,
      provider: input.provider,
    })
    .onConflictDoUpdate({
      target: connectorHealth.deviceId,
      set: { paused: pausedFlag, remotePaused: pausedFlag },
    });
}

/** Whether the dashboard has paused collection for this device. */
export async function isRemotelyPaused(deviceId: string): Promise<boolean> {
  const rows = await db
    .select({ remotePaused: connectorHealth.remotePaused })
    .from(connectorHealth)
    .where(eq(connectorHealth.deviceId, deviceId))
    .limit(1);
  return rows[0]?.remotePaused === 1;
}

export function hashDeviceToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function verifyDeviceToken(
  deviceId: string,
  token: string,
): Promise<{ ok: boolean; organizationId?: string; developerId?: string }> {
  if (token === "dev-device-token" && devAffordancesEnabled()) {
    return {
      ok: true,
      organizationId: DEV_ORG,
      developerId: DEV_DEVELOPER_ALEX,
    };
  }
  const hash = hashDeviceToken(token);
  const rows = await db
    .select()
    .from(devices)
    .where(and(eq(devices.id, deviceId), isNull(devices.revokedAt)));
  const row = rows[0];
  if (!row || row.tokenHash !== hash) return { ok: false };
  return {
    ok: true,
    organizationId: row.organizationId,
    developerId: row.developerId,
  };
}

export async function registerDevice(input: {
  organizationId: string;
  developerId: string;
  publicKey?: string;
  actorId?: string;
  provider?: string | null;
  label?: string | null;
}): Promise<{ deviceId: string; token: string }> {
  const deviceId = randomUUID();
  const token = randomBytes(32).toString("base64url");
  await db.insert(devices).values({
    id: deviceId,
    organizationId: input.organizationId,
    developerId: input.developerId,
    tokenHash: hashDeviceToken(token),
    publicKey: input.publicKey ?? null,
    provider: input.provider ?? "cursor",
    label: input.label ?? "Workstation connector",
    revokedAt: null,
    createdAt: new Date(),
  });
  await db.insert(auditLog).values({
    organizationId: input.organizationId,
    actorId: input.actorId ?? null,
    action: "connector.register",
    detail: { deviceId, developerId: input.developerId },
    createdAt: new Date(),
  });
  return { deviceId, token };
}

export async function revokeDevice(
  organizationId: string,
  deviceId: string,
  actorId?: string,
): Promise<boolean> {
  const rows = await db
    .update(devices)
    .set({ revokedAt: new Date() })
    .where(
      and(eq(devices.id, deviceId), eq(devices.organizationId, organizationId)),
    )
    .returning({ id: devices.id });
  if (rows.length === 0) return false;
  await db.insert(auditLog).values({
    organizationId,
    actorId: actorId ?? null,
    action: "connector.revoke",
    detail: { deviceId },
    createdAt: new Date(),
  });
  return true;
}

export async function listOrgDevices(organizationId: string) {
  return db
    .select()
    .from(devices)
    .where(and(eq(devices.organizationId, organizationId), eq(devices.kind, "connector")));
}

export async function listDeveloperDevices(
  organizationId: string,
  developerId: string,
) {
  return db
    .select()
    .from(devices)
    .where(
      and(
        eq(devices.organizationId, organizationId),
        eq(devices.developerId, developerId),
        isNull(devices.revokedAt),
        eq(devices.kind, "connector"),
      ),
    );
}

export async function getDevice(
  organizationId: string,
  deviceId: string,
): Promise<(typeof devices.$inferSelect) | null> {
  const rows = await db
    .select()
    .from(devices)
    .where(and(eq(devices.id, deviceId), eq(devices.organizationId, organizationId)));
  return rows[0] ?? null;
}

/**
 * Bind an installation's signing key exactly once. Re-activation by the same
 * installation is allowed; replacing the key requires revoking and reissuing
 * the admin credential.
 */
export async function bindDevicePublicKey(
  organizationId: string,
  deviceId: string,
  publicKey: string,
): Promise<boolean> {
  if (!publicKey || publicKey.length > 256) return false;
  const updated = await db
    .update(devices)
    .set({ publicKey })
    .where(
      and(
        eq(devices.organizationId, organizationId),
        eq(devices.id, deviceId),
        isNull(devices.revokedAt),
        isNull(devices.publicKey),
      ),
    )
    .returning({ id: devices.id });
  if (updated.length > 0) return true;

  const existing = await getDevice(organizationId, deviceId);
  return existing?.revokedAt == null && existing?.publicKey === publicKey;
}

/**
 * A heartbeat from the local connector is proof that *this* device is running.
 * Seeded sample tools for the same person (e.g. Claude Code on Alex) are not
 * a process check — they get frozen so the dashboard cannot show them online.
 */
export async function recordLiveHeartbeat(input: {
  deviceId: string;
  organizationId: string;
  developerId: string;
  version?: string | null;
  queueDepth?: number | null;
  paused?: boolean;
  provider?: string | null;
  tokenHash?: string;
  capabilities?: unknown;
}): Promise<void> {
  const now = new Date();
  const provider = isKnownProvider(input.provider) ? input.provider : null;
  const capabilities = sanitizeCapabilityReport(input.capabilities);

  await db
    .insert(devices)
    .values({
      id: input.deviceId,
      organizationId: input.organizationId,
      developerId: input.developerId,
      tokenHash: input.tokenHash ?? hashDeviceToken("live-heartbeat"),
      provider,
      label: provider ? `${providerLabel(provider)} (this machine)` : "This machine",
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: devices.id,
      set: {
        revokedAt: null,
        ...(provider ? { provider } : {}),
      },
    });

  await db
    .insert(connectorHealth)
    .values({
      deviceId: input.deviceId,
      organizationId: input.organizationId,
      lastHeartbeat: now,
      version: input.version ?? null,
      // Not reported ≠ empty queue: keep null so the UI shows "—".
      queueDepth: input.queueDepth ?? null,
      paused: input.paused ? 1 : 0,
      provider,
      capabilities,
      capabilitiesAt: capabilities ? now : null,
    })
    .onConflictDoUpdate({
      target: connectorHealth.deviceId,
      set: {
        lastHeartbeat: now,
        version: input.version ?? null,
        queueDepth: input.queueDepth ?? null,
        // A dashboard pause stays in force until resumed from the dashboard.
        paused: sql`GREATEST(${input.paused ? 1 : 0}, ${connectorHealth.remotePaused})`,
        provider,
        ...(capabilities ? { capabilities, capabilitiesAt: now } : {}),
      },
    });
}

export interface ProviderCapabilityReport {
  missing: string[];
  sources: string[];
  lastEventAt: string | null;
}

const KNOWN_AREAS = new Set([
  "session_boundaries",
  "model_request",
  "model_call_timing",
  "tool_calls",
  "token_totals",
  "hourly_summary",
]);

/**
 * Keeps only known providers, known capability areas, and known sources, so a
 * connector cannot write arbitrary JSON into the dashboard.
 */
export function sanitizeCapabilityReport(
  raw: unknown,
): { providers: Record<string, ProviderCapabilityReport>; claudeOtelConfigured: boolean } | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { providers?: Record<string, unknown>; claudeOtelConfigured?: unknown };
  if (!r.providers || typeof r.providers !== "object") return null;
  const providers: Record<string, ProviderCapabilityReport> = {};
  for (const [id, value] of Object.entries(r.providers)) {
    if (!isKnownProvider(id) || !value || typeof value !== "object") continue;
    const v = value as { missing?: unknown; sources?: unknown; lastEventAt?: unknown };
    const missing = Array.isArray(v.missing)
      ? v.missing.filter((m): m is string => typeof m === "string" && KNOWN_AREAS.has(m))
      : [];
    const sources = Array.isArray(v.sources)
      ? v.sources.filter((m): m is string => ["hook", "otel", "companion", "provider_api"].includes(String(m))).map(String)
      : [];
    const last = typeof v.lastEventAt === "string" && !Number.isNaN(Date.parse(v.lastEventAt)) ? v.lastEventAt : null;
    providers[id] = { missing, sources, lastEventAt: last };
  }
  return { providers, claudeOtelConfigured: r.claudeOtelConfigured === true };
}
