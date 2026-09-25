import { describe, expect, it } from "vitest";
import { validatePortalPassword } from "./password-policy.js";

describe("validatePortalPassword", () => {
  it("accepts a policy-compliant password", () => {
    expect(validatePortalPassword("Manager123!")).toBeNull();
  });

  it("rejects short passwords", () => {
    expect(validatePortalPassword("Ab1!")).toBe("password_too_short");
  });

  it("requires an uppercase letter", () => {
    expect(validatePortalPassword("manager123!")).toBe("password_needs_uppercase");
  });

  it("requires a special character", () => {
    expect(validatePortalPassword("Manager123")).toBe("password_needs_special");
  });
});
