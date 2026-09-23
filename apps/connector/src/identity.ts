import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { deleteSecret, getSecret, setSecret } from "./secret-store.js";
import { homedir } from "node:os";
import { join } from "node:path";

export type ConnectorIdentity = {
  organizationId: string;
  developerId: string;
  deviceId: string;
  deviceToken: string;
  apiBaseUrl: string;
  displayName: string;
  claimedAt: string;
  provider?: string;
  label?: string;
  providers?: string[];
};

const DIR = join(homedir(), ".techlio-connector");
const FILE = join(DIR, "identity.json");

export function identityDir(): string {
  return DIR;
}

const TOKEN_SECRET = "device-token";

/**
 * identity.json holds only non-secret pairing metadata. The device token lives
 * in the OS credential store. Files written by older builds that still contain
 * the token are migrated on first load.
 */
export function loadIdentity(): ConnectorIdentity | null {
  try {
    if (!existsSync(FILE)) return null;
    const raw = JSON.parse(readFileSync(FILE, "utf8")) as Partial<ConnectorIdentity>;
    if (raw.deviceToken) {
      setSecret(TOKEN_SECRET, raw.deviceToken);
      writeMetadata({ ...raw, deviceToken: undefined });
    }
    const deviceToken = raw.deviceToken ?? getSecret(TOKEN_SECRET);
    if (raw.deviceId && deviceToken && raw.developerId && raw.organizationId) {
      return { ...(raw as ConnectorIdentity), deviceToken };
    }
  } catch {
    /* ignore corrupt file */
  }
  return null;
}

function writeMetadata(meta: Partial<ConnectorIdentity>): void {
  mkdirSync(DIR, { recursive: true, mode: 0o700 });
  const { deviceToken: _omit, ...rest } = meta;
  const tmp = `${FILE}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(rest, null, 2), { mode: 0o600 });
  renameSync(tmp, FILE);
}

export function saveIdentity(id: ConnectorIdentity): void {
  setSecret(TOKEN_SECRET, id.deviceToken);
  writeMetadata(id);
}

export function clearIdentity(): void {
  deleteSecret(TOKEN_SECRET);
  try {
    if (existsSync(FILE)) unlinkSync(FILE);
  } catch {
    /* already gone */
  }
}

export function publicIdentity(id: ConnectorIdentity | null) {
  if (!id) return { paired: false as const };
  const providers = id.providers?.length
    ? id.providers
    : id.provider
      ? [id.provider]
      : [];
  return {
    paired: true as const,
    displayName: id.displayName,
    developerId: id.developerId,
    deviceId: id.deviceId,
    organizationId: id.organizationId,
    provider: id.provider ?? providers[0] ?? null,
    label: id.label ?? null,
    providers,
  };
}
