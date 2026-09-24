import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export function connectorPort() {
  try {
    const p = Number(readFileSync(join(homedir(), ".techlio-connector", "port"), "utf8").trim());
    if (p > 0) return p;
  } catch {
    /* default */
  }
  return 9477;
}

export function connectorBase() {
  return `http://127.0.0.1:${connectorPort()}`;
}
