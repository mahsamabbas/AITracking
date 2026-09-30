import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { userInfo } from "node:os";
import { join } from "node:path";
import { dataDir } from "./paths.js";

/**
 * Each OS user runs their own connector. Two people signed in to one computer
 * (separate macOS/Windows profiles) must never report through each other's
 * connector, so every user gets their own port in BASE_PORT … BASE_PORT+9,
 * recorded in their own home folder. Hook runners, the menu-bar app and the
 * IDE companion read this file, so they always reach *their* user's connector.
 */
export const BASE_PORT = 9477;
export const PORT_COUNT = 10;

export function portFile(): string {
  return join(dataDir(), "port");
}

/** The port this user's connector listens on (env override → recorded → default). */
export function userPort(): number {
  const fromEnv = Number(process.env.CONNECTOR_PORT);
  if (Number.isInteger(fromEnv) && fromEnv > 0) return fromEnv;
  try {
    if (existsSync(portFile())) {
      const recorded = Number(readFileSync(portFile(), "utf8").trim());
      if (Number.isInteger(recorded) && recorded > 0) return recorded;
    }
  } catch {
    /* unreadable: fall back to the default */
  }
  return BASE_PORT;
}

export function recordUserPort(port: number): void {
  mkdirSync(dataDir(), { recursive: true, mode: 0o700 });
  const tmp = `${portFile()}.${process.pid}.tmp`;
  writeFileSync(tmp, `${port}\n`, { mode: 0o644 });
  renameSync(tmp, portFile());
}

/** Identifies which OS user a running connector belongs to (reported on /health). */
export function osUser(): string {
  try {
    return userInfo().username;
  } catch {
    return process.env.USER ?? process.env.USERNAME ?? "unknown";
  }
}

/**
 * Picks this user's port: the preferred one unless another OS user's connector
 * (or another program) holds it — then the next port in the range. A port held
 * by *this* user's own connector is kept; the duplicate is resolved after listen.
 */
export async function choosePort(input: {
  preferred: number;
  me: string;
  isFree: (port: number) => Promise<boolean>;
  /** osUser reported by a Techlio connector on that port; undefined = not a connector; null = old build. */
  ownerOf: (port: number) => Promise<string | null | undefined>;
}): Promise<number> {
  const candidates = [input.preferred, ...Array.from({ length: PORT_COUNT }, (_, i) => BASE_PORT + i)].filter(
    (p, i, all) => all.indexOf(p) === i,
  );
  for (const port of candidates) {
    if (await input.isFree(port)) return port;
    const owner = await input.ownerOf(port);
    if (owner === null || owner === input.me) return port;
  }
  return input.preferred;
}
