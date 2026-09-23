import { afterEach, describe, expect, it } from "vitest";
import { assertRuntimeConfig, devAffordancesEnabled, jwtSecret } from "./runtime.js";
import { assertSeedTargetIsLocal } from "./seed.js";

const KEYS = ["TECHLIO_DEV_MODE", "NODE_ENV", "VERCEL", "RENDER", "JWT_SECRET", "DATABASE_URL"];
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

function env(values: Record<string, string | undefined>) {
  for (const k of KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(values)) if (v !== undefined) process.env[k] = v;
}

afterEach(() => env(saved as Record<string, string | undefined>));

describe("dev affordances are fail-closed", () => {
  it("are off unless TECHLIO_DEV_MODE=1 is set explicitly", () => {
    env({ NODE_ENV: "development" });
    expect(devAffordancesEnabled()).toBe(false);
  });

  it("are refused on any hosted runtime even when requested", () => {
    for (const hosted of [{ NODE_ENV: "production" }, { VERCEL: "1" }, { RENDER: "true" }]) {
      env({ TECHLIO_DEV_MODE: "1", ...hosted });
      expect(devAffordancesEnabled()).toBe(false);
    }
  });

  it("refuses to boot with dev mode on a hosted runtime", () => {
    env({ TECHLIO_DEV_MODE: "1", VERCEL: "1", JWT_SECRET: "x".repeat(40) });
    expect(() => assertRuntimeConfig()).toThrow(/not allowed/);
  });

  it("refuses to boot without a strong JWT secret outside dev mode", () => {
    env({ NODE_ENV: "production" });
    expect(() => assertRuntimeConfig()).toThrow(/JWT_SECRET/);
    env({ NODE_ENV: "production", JWT_SECRET: "techlio-dev-jwt-secret-change-me" });
    expect(() => assertRuntimeConfig()).toThrow(/JWT_SECRET/);
    env({ NODE_ENV: "production", JWT_SECRET: "a".repeat(64) });
    expect(() => assertRuntimeConfig()).not.toThrow();
  });

  it("has no default signing secret outside dev mode", () => {
    env({ NODE_ENV: "production" });
    expect(() => jwtSecret()).toThrow();
  });
});

describe("demo seed guard", () => {
  it("refuses without dev mode", () => {
    env({});
    expect(() => assertSeedTargetIsLocal()).toThrow(/TECHLIO_DEV_MODE/);
  });

  it("refuses a remote database even in dev mode", () => {
    env({ TECHLIO_DEV_MODE: "1", DATABASE_URL: "postgres://u:p@ep-cool-db.neon.tech/main" });
    expect(() => assertSeedTargetIsLocal()).toThrow(/remote/);
  });

  it("allows the local Docker database in dev mode", () => {
    env({ TECHLIO_DEV_MODE: "1", DATABASE_URL: "postgres://techlio:techlio@localhost:5432/techlio_activity" });
    expect(() => assertSeedTargetIsLocal()).not.toThrow();
  });
});
