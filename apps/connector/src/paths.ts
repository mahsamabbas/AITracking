import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Per-user connector locations. Functions (not constants) so the home
 * directory is read when called — tests point HOME at a temp folder.
 *
 *   dataDir     ~/.techlio-connector   identity, port, queue, secrets, logs, state
 *   installDir  ~/.techlio/connector   installed binary, .env, hook script, companion
 */
export function dataDir(): string {
  return join(homedir(), ".techlio-connector");
}

export function installDir(): string {
  return join(homedir(), ".techlio", "connector");
}
