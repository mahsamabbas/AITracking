/** `super_admin` manages organisations on the platform; it has no access to any organisation's activity. */
export type Role = "administrator" | "manager" | "developer" | "auditor" | "super_admin";

/** Roles an organisation administrator may assign under Access (not platform super admins). */
export const ORG_ASSIGNABLE_ROLES = [
  "administrator",
  "manager",
  "developer",
  "auditor",
] as const satisfies readonly Role[];

export type OrgAssignableRole = (typeof ORG_ASSIGNABLE_ROLES)[number];

export interface AuthUser {
  id: string;
  email?: string;
  displayName?: string;
  organizationId: string;
  role: Role;
  developerId?: string;
}

/** Manager and admin may view any developer in their organization. */
export function canViewTeam(user: AuthUser): boolean {
  return user.role === "manager" || user.role === "administrator";
}

/**
 * Individual activity (events, hourly cards, drill-down).
 * Auditors review controls — not developer timelines (PRD §4, §12).
 */
export function canViewDeveloper(user: AuthUser, developerId: string): boolean {
  if (user.role === "administrator" || user.role === "manager") return true;
  if (user.role === "developer") return user.developerId === developerId;
  return false;
}

export function canViewConnectorHealth(user: AuthUser): boolean {
  return (
    user.role === "administrator" ||
    user.role === "manager" ||
    user.role === "auditor"
  );
}

export function canManageConnectors(user: AuthUser): boolean {
  return user.role === "administrator";
}

export function canRegisterConnector(
  user: AuthUser,
  _developerId: string,
): boolean {
  return user.role === "administrator";
}

export function canPauseConnector(user: AuthUser, developerId: string): boolean {
  if (user.role === "administrator") return true;
  if (user.role === "developer") return user.developerId === developerId;
  return false;
}

export function canExportActivity(user: AuthUser): boolean {
  return user.role === "manager" || user.role === "administrator";
}

export function canViewAudit(user: AuthUser): boolean {
  return user.role === "auditor" || user.role === "administrator";
}

export function canManageUsers(user: AuthUser): boolean {
  return user.role === "administrator";
}

export function canViewActivityEvents(user: AuthUser): boolean {
  return user.role !== "auditor";
}

/**
 * Landing route per role. Developers land on their own analytics page, which is
 * the same surface managers see — FR-004 requires parity, not a reduced view.
 */
export function homePathForRole(role: Role, developerId?: string | null): string {
  if (role === "super_admin") return "/platform";
  if (role === "developer") return developerId ? `/employees/${developerId}` : "/";
  if (role === "auditor") return "/audit";
  return "/";
}

export function navForRole(role: Role): string[] {
  if (role === "super_admin") return ["/platform"];
  if (role === "developer") return ["/", "/employees/:self", "/my-connectors", "/policy"];
  if (role === "auditor") return ["/audit", "/connectors", "/policy"];
  if (role === "administrator") {
    return ["/", "/employees", "/connectors", "/users", "/audit", "/policy"];
  }
  return ["/", "/employees", "/connectors", "/policy"];
}
