#!/usr/bin/env node
/**
 * Post-commit hook: records one allowlisted build_completed signal (no commit
 * message, hash, or diff). Requires the Techlio connector to be running.
 */
import { connectorBase } from "./techlio-connector-port.mjs";

const res = await fetch(`${connectorBase()}/hooks/git-commit`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ status: "succeeded" }),
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
