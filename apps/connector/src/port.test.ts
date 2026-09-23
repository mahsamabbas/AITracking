import { describe, expect, it } from "vitest";
import { choosePort } from "./port.js";

describe("choosePort", () => {
  const owners = new Map<number, string | null>();
  const pick = (preferred: number, me: string) =>
    choosePort({
      preferred,
      me,
      isFree: async (p) => !owners.has(p),
      ownerOf: async (p) => owners.get(p),
    });

  it("gives a second OS user on the same computer their own port", async () => {
    owners.clear();
    owners.set(9477, "alice");
    expect(await pick(9477, "bob")).toBe(9478);
  });

  it("keeps the port held by the same user's own connector (duplicate handled later)", async () => {
    owners.clear();
    owners.set(9477, "alice");
    expect(await pick(9477, "alice")).toBe(9477);
  });

  it("returns to a recorded port and skips ports held by other users or programs", async () => {
    owners.clear();
    owners.set(9481, "carol");
    owners.set(9477, "alice");
    expect(await pick(9481, "dave")).toBe(9478);
  });
});
