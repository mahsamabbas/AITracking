import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EXPECTED_SCHEMA_MIGRATION, isSchemaDriftError } from "./schema-version.js";

describe("schema version", () => {
  it("matches the newest migration in infra/sql", () => {
    const dir = join(dirname(fileURLToPath(import.meta.url)), "../../../infra/sql");
    const latest = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort().pop();
    expect(EXPECTED_SCHEMA_MIGRATION).toBe(latest);
  });

  it("recognises missing column/table errors, including wrapped ones", () => {
    expect(isSchemaDriftError({ code: "42703" })).toBe(true);
    expect(isSchemaDriftError({ cause: { code: "42P01" } })).toBe(true);
    expect(isSchemaDriftError({ code: "23505" })).toBe(false);
  });
});
