import { spawnSync, type SpawnSyncOptions } from "node:child_process";
import { createHash } from "node:crypto";
import { platform } from "node:os";

/** Child process options for background helpers: no output, no console window on Windows. */
export const QUIET: SpawnSyncOptions = { stdio: "ignore", windowsHide: true };

/** True when `cmd` is on PATH (`where` on Windows, `which` elsewhere). */
export function onPath(cmd: string, options: SpawnSyncOptions = { stdio: "ignore" }): boolean {
  return spawnSync(platform() === "win32" ? "where" : "which", [cmd], options).status === 0;
}

/**
 * Stable UUID-shaped id from any string (SHA-256, version-4/variant bits set).
 * Deterministic: the same seed always yields the same id, which keeps
 * derived session and commit ids idempotent across restarts.
 */
export function uuidFromSeed(seed: string): string {
  const h = createHash("sha256").update(seed).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
