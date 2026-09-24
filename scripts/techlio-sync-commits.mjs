#!/usr/bin/env node
/**
 * Sync this repository's recent commits to Techlio now: asks the local
 * connector to read them from git (last 14 days, this git user only) and
 * report Committed / Shipped. Only counts leave the machine — never hashes,
 * messages, or code. Run from inside any git repository:
 *   node scripts/techlio-sync-commits.mjs
 */
import { connectorBase } from "./techlio-connector-port.mjs";

const res = await fetch(`${connectorBase()}/hooks/git-commit`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ status: "succeeded", cwd: process.cwd() }),
}).catch(() => null);

if (!res?.ok) {
  console.error("Techlio: the connector is not running on this computer. Start or reinstall it, then run this again.");
  process.exit(1);
}
const body = await res.json().catch(() => ({}));
console.log(body.accepted ? "Techlio: this repository's recent commits were synced." : "Techlio: connector is not activated or is paused — nothing was synced.");
