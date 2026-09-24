#!/usr/bin/env node
/**
 * Notifies the local Techlio connector that repo CI checks passed (run this
 * after lint/tests in pre-commit). Requires the connector to be running.
 * Does not send git metadata — only an allowlisted test_completed signal.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

function connectorPort() {
  try {
    const p = Number(readFileSync(join(homedir(), ".techlio-connector", "port"), "utf8").trim());
    if (p > 0) return p;
  } catch {
    /* default */
  }
  return 9477;
}

const port = connectorPort();
const res = await fetch(`http://127.0.0.1:${port}/hooks/ci-gate`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ status: "succeeded" }),
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
