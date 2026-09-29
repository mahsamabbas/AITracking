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

  it("maps Windsurf / Devin Desktop and unknown VS Code forks", () => {
    expect(providerFromHostApp("Windsurf")).toBe("windsurf");
    expect(providerFromHostApp("Devin Desktop")).toBe("windsurf");
    expect(providerFromHostApp("Some VS Code fork")).toBe("vscode");
  });

  it("lists every hook-based agent as Tier A with hourly telemetry", () => {
    for (const id of ["codex", "gemini", "github_copilot", "windsurf", "devin"]) {
      expect(providerCapability(id)).toMatchObject({ tier: "A", hourly: true });
    }
  });

  it("never claims token totals from hook-only providers", () => {
    // Agent hooks carry no token counts, so tokens must read as unavailable, not zero.
    for (const id of ["claude_code", "cursor", "codex", "gemini", "github_copilot", "windsurf", "devin"]) {
      expect(providerCapability(id)?.missing).toContain("token_totals");
    }
  });
});
