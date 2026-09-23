import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./users.js";

describe("password hashing", () => {
  it("uses a per-user salt so equal passwords hash differently", () => {
    const a = hashPassword("correct horse battery staple");
    const b = hashPassword("correct horse battery staple");
    expect(a).not.toBe(b);
    expect(a.startsWith("scrypt$")).toBe(true);
    expect(verifyPassword("correct horse battery staple", a)).toEqual({ ok: true, legacy: false });
    expect(verifyPassword("wrong", a).ok).toBe(false);
  });

  it("still verifies legacy SHA-256 hashes and flags them for upgrade", () => {
    const legacy = createHash("sha256").update("techlio:old-password").digest("hex");
    expect(verifyPassword("old-password", legacy)).toEqual({ ok: true, legacy: true });
  });

  it("never matches the disabled-credential sentinel from migration 008", () => {
    expect(verifyPassword("manager123", "!disabled-default-credential").ok).toBe(false);
  });
});
