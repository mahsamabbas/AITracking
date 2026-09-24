#!/usr/bin/env node
/**
 * Notifies the local Techlio connector that repo CI checks passed (run this
 * after lint/tests in pre-commit). Requires the connector to be running.
 * Does not send git metadata — only an allowlisted test_completed signal.
 */
import { connectorBase } from "./techlio-connector-port.mjs";

const res = await fetch(`${connectorBase()}/hooks/ci-gate`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ status: "succeeded", cwd: process.cwd() }),
}).catch(() => null);

if (!res?.ok) {
  console.warn(
    "Techlio: connector not reachable — Verify & ship will not include this commit's CI gate. Start the connector and try again.",
  );
  process.exit(0);
}

const body = await res.json().catch(() => ({}));
if (body.accepted) {
  console.log("Techlio: recorded local CI gate for the active agent session.");
}
