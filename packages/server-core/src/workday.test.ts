import { describe, expect, it } from "vitest";
import { distinctFileChanges } from "./workday.js";

describe("workday distinct file changes", () => {
  it("counts unique paths in the hour, not raw events", () => {
    const hour0 = 0;
    const hour1 = 3_600_000;
    const files = [
      { at: 100, path: "a.ts" },
      { at: 200, path: "a.ts" },
      { at: 300, path: "b.ts" },
      { at: 3_700_000, path: "c.ts" },
    ];
    expect(distinctFileChanges(files, hour0, hour1)).toBe(2);
    expect(distinctFileChanges(files, hour1, hour1 + 3_600_000)).toBe(1);
  });
});
