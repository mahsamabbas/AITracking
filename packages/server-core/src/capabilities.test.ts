import { describe, expect, it } from "vitest";
import { sanitizeCapabilityReport } from "./devices.js";
import { catalogCapability } from "./ai-progress.js";

describe("FR-012 capability reports", () => {
  it("keeps only known providers, areas, and sources", () => {
    const r = sanitizeCapabilityReport({
      claudeOtelConfigured: true,
      providers: {
        claude_code: { missing: [], sources: ["hook", "otel"], lastEventAt: "2026-09-23T10:00:00.000Z" },
        cursor: { missing: ["token_totals", "model_call_timing", "<script>"], sources: ["hook", "evil"] },
        not_a_provider: { missing: ["token_totals"] },
      },
    });
    expect(Object.keys(r!.providers).sort()).toEqual(["claude_code", "cursor"]);
    expect(r!.providers.cursor.missing).toEqual(["token_totals", "model_call_timing"]);
    expect(r!.providers.cursor.sources).toEqual(["hook"]);
    expect(r!.claudeOtelConfigured).toBe(true);
  });

  it("rejects malformed reports", () => {
    expect(sanitizeCapabilityReport(null)).toBeNull();
    expect(sanitizeCapabilityReport({ providers: "x" })).toBeNull();
  });

  it("falls back to the catalog with human-readable gaps", () => {
    const c = catalogCapability("cursor");
    expect(c.source).toBe("catalog");
    expect(c.missing).toContain("token_totals");
    expect(c.unavailable.join(" ")).toMatch(/Token totals/);
    expect(catalogCapability("antigravity").missing).toEqual(["token_totals"]);
  });
});
