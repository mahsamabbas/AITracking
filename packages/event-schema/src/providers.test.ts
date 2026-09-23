import { describe, expect, it } from "vitest";
import {
  providerCapability,
  providerFromHostApp,
  providerLabel,
} from "./providers.js";

describe("providerFromHostApp", () => {
  it("maps Cursor IDE to cursor, not claude_code", () => {
    expect(providerFromHostApp("Cursor")).toBe("cursor");
    expect(providerLabel("cursor")).toBe("Cursor");
  });

  it("maps VS Code distinctly", () => {
    expect(providerFromHostApp("Visual Studio Code")).toBe("vscode");
  });

  it("does not claim unavailable adapters provide hourly telemetry", () => {
    expect(providerCapability("codex")?.hourly).toBe(false);
    expect(providerCapability("gemini")?.hourly).toBe(false);
  });

  it("never claims token totals from hook-only providers", () => {
    // Claude Code and Cursor hooks carry no token counts; the connector's OTLP
    // routes reject telemetry, so tokens must read as unavailable, not zero.
    expect(providerCapability("claude_code")?.missing).toContain("token_totals");
    expect(providerCapability("cursor")?.missing).toContain("token_totals");
  });

  it("marks daily-report providers as Tier B without session metrics", () => {
    expect(providerCapability("github_copilot")).toMatchObject({ tier: "B", hourly: false });
    expect(providerCapability("github_copilot")?.missing).toContain("session_boundaries");
  });
});
