import { eq } from "drizzle-orm";
import { db } from "./db.js";
import { organizations } from "./schema.js";
import type { AuthUser } from "./roles.js";

/** Sent by the web app when a platform super admin views a customer organisation. */
export const TECHLIO_ORG_CONTEXT_HEADER = "x-techlio-org-id";

export type CustomerOrganization = {
  id: string;
  name: string;
  timezone: string;
  disabled: boolean;
};

export async function getCustomerOrganization(id: string): Promise<CustomerOrganization | null> {
  const rows = await db.select().from(organizations).where(eq(organizations.id, id));
  const row = rows[0];
  if (!row || row.kind !== "customer") return null;
  return {
    id: row.id,
    name: row.name,
    timezone: row.timezone,
    disabled: row.disabledAt != null,
  };
}

/**
 * Resolves which organisation's data an API call applies to.
 * Super admins must send {@link TECHLIO_ORG_CONTEXT_HEADER}; they act as read-only
 * administrators inside that tenant (writes are blocked separately).
 */
export async function resolveOrgAccess(
  user: AuthUser,
  requestedOrgId?: string | null,
): Promise<{ organizationId: string; actor: AuthUser; platformView: boolean }> {
  const requested = requestedOrgId?.trim() || undefined;

  if (user.role === "super_admin") {
    if (!requested) {
      throw new Error("org_context_required");
    }
    const org = await getCustomerOrganization(requested);
    if (!org) throw new Error("organization_not_found");
    if (org.disabled) throw new Error("organization_disabled");
    return {
      organizationId: org.id,
      actor: { ...user, organizationId: org.id, role: "administrator" },
      platformView: true,
    };
  }

  if (requested && requested !== user.organizationId) {
    throw new Error("org_context_forbidden");
  }

  return { organizationId: user.organizationId, actor: user, platformView: false };
}
