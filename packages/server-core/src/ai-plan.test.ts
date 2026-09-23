import { describe, expect, it } from "vitest";
import { buildProviderRow } from "./ai-plan.js";

const base = { periodLabel: "September 2026", planConfig: undefined, tierB: undefined };

describe("AI plan usage reports only what providers measured", () => {
  it("shows no limit and no remaining when no plan is configured", () => {
    const row = buildProviderRow({
      ...base,
      provider: "claude_code",
      session: { provider: "claude_code", token_input: null, token_output: null, sessions_with_tokens: 0, model_requests: "12", session_count: 3 },
    });
    expect(row.monthlyLimit).toBeNull();
    expect(row.remaining).toBeNull();
    expect(row.usageUnit).toBe("model_requests");
  });

  it("reports null, not 0, when the provider reported nothing", () => {
    const row = buildProviderRow({
      ...base,
      provider: "cursor",
      session: { provider: "cursor", token_input: null, token_output: null, sessions_with_tokens: 0, model_requests: "0", session_count: 2 },
    });
    expect(row.tokensUsed).toBeNull();
    expect(row.tokenInput).toBeNull();
    expect(row.usageSource).toBe("none");
  });

  it("never compares a request count against a token budget", () => {
    const row = buildProviderRow({
      ...base,
      provider: "cursor",
      planConfig: { monthlyTokenBudget: 2_000_000 },
      session: undefined,
      tierB: { completions: "40", chat_requests: "7", billable_requests: "31" },
    });
    expect(row.usageUnit).toBe("cursor_admin_requests");
    expect(row.tokensUsed).toBe(31);
    expect(row.monthlyLimit).toBeNull();
  });

  it("keeps chat requests and tab completions separate from the billable headline", () => {
    const row = buildProviderRow({
      ...base,
      provider: "cursor",
      planConfig: { monthlyRequestBudget: 500 },
      session: undefined,
      tierB: { completions: "40", chat_requests: "7", billable_requests: "31" },
    });
    expect(row.chatRequestsCount).toBe(7);
    expect(row.completionsCount).toBe(40);
    expect(row.remaining).toBe(469);
  });
});
