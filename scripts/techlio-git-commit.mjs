#!/usr/bin/env node
/**
 * Post-commit hook: asks the local connector to scan this repo now, so the commit
 * shows up immediately (Commit → Verified → Shipped). Only counts leave the
 * machine — no commit message, hash, or diff. The connector also finds commits
 * on its own every minute in repos the agents work in, without this hook.
 */
import { connectorBase } from "./techlio-connector-port.mjs";

const res = await fetch(`${connectorBase()}/hooks/git-commit`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ status: "succeeded", cwd: process.cwd() }),
}).catch(() => null);

if (!res?.ok) {
  console.warn(
    "Techlio: connector not reachable — this commit was not counted toward Verify & ship. Start the connector.",
  );
  process.exit(0);
}

const body = await res.json().catch(() => ({}));
if (body.accepted) {
  console.log("Techlio: recorded git commit for Verify & ship.");
}
