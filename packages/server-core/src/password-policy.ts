/** Shared portal password rules (admin-created users and password changes). */

export const PORTAL_FIELD_LIMITS = {
  displayName: 120,
  email: 254,
  password: 128,
  team: 80,
  title: 120,
  orgName: 120,
  searchQuery: 200,
  deviceId: 64,
  connectorToken: 256,
  connectorLabel: 200,
  deleteConfirm: 80,
  timezone: 64,
} as const;

export type PasswordPolicyError =
  | "password_too_short"
  | "password_too_long"
  | "password_needs_uppercase"
  | "password_needs_special";

export function validatePortalPassword(password: string): PasswordPolicyError | null {
  if (password.length < 8) return "password_too_short";
  if (password.length > PORTAL_FIELD_LIMITS.password) return "password_too_long";
  if (!/[A-Z]/.test(password)) return "password_needs_uppercase";
  if (!/[^A-Za-z0-9]/.test(password)) return "password_needs_special";
  return null;
}

export function passwordPolicyMessage(code: PasswordPolicyError): string {
  switch (code) {
    case "password_too_short":
      return "Password must be at least 8 characters.";
    case "password_too_long":
      return `Password must be at most ${PORTAL_FIELD_LIMITS.password} characters.`;
    case "password_needs_uppercase":
      return "Include at least one capital letter.";
    case "password_needs_special":
      return "Include at least one special character.";
    default:
      return "Password does not meet requirements.";
  }
}
