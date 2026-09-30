import { ForbiddenException } from "@nestjs/common";
import { canViewDeveloper, type AuthUser } from "@techlio/server-core";

/** Developers may only ever resolve to their own record (FR-002, FR-004). */
export function scopeDeveloperIds(user: AuthUser): string[] | undefined {
  if (user.role === "developer") {
    return user.developerId ? [user.developerId] : [];
  }
  return undefined;
}

/** Auditors review controls, never individual activity. */
export function assertCanViewPeople(user: AuthUser): void {
  if (user.role === "auditor") {
    throw new ForbiddenException("auditor_cannot_view_individual_activity");
  }
}

/** The actor may see this developer's activity (managers/admins: anyone; developers: self). */
export function assertInScope(user: AuthUser, developerId: string): void {
  if (!canViewDeveloper(user, developerId)) throw new ForbiddenException("out_of_scope");
}

/** Individual-activity endpoints: not an auditor, and the developer is in scope. */
export function assertCanViewDeveloper(user: AuthUser, developerId: string): void {
  assertCanViewPeople(user);
  assertInScope(user, developerId);
}
