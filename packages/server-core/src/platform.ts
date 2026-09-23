import { randomBytes, randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "./db.js";
import { auditLog, organizations } from "./schema.js";
import { createPortalUser } from "./users.js";

/**
 * Multi-tenant platform. A super admin (role `super_admin`, living in the
 * "platform" organisation) creates customer organisations and their first
 * administrators; each organisation then manages its own accounts under
 * Access. The super admin never sees an organisation's activity data — every
 * analytics route requires an organisation role.
 */

export interface OrganizationSummary {
  id: string;
  name: string;
  timezone: string;
  createdAt: string;
  disabled: boolean;
  administrators: number;
  users: number;
  employees: number;
  connectors: number;
  lastActivityAt: string | null;
}

/** A readable one-time password; shown once to the super admin. */
function generatePassword(): string {
  return randomBytes(12).toString("base64url");
}

export async function listOrganizations(): Promise<OrganizationSummary[]> {
  const res = await db.execute<{
    id: string;
    name: string;
    timezone: string;
    created_at: Date;
    disabled_at: Date | null;
    administrators: number;
    users: number;
    employees: number;
    connectors: number;
    last_activity: Date | null;
  }>(sql`
    SELECT o.id, o.name, o.timezone, o.created_at, o.disabled_at,
           (SELECT COUNT(*)::int FROM portal_users u WHERE u.organization_id = o.id AND u.role = 'administrator') AS administrators,
           (SELECT COUNT(*)::int FROM portal_users u WHERE u.organization_id = o.id) AS users,
           (SELECT COUNT(*)::int FROM employees e WHERE e.organization_id = o.id) AS employees,
           (SELECT COUNT(*)::int FROM devices d
             WHERE d.organization_id = o.id AND d.revoked_at IS NULL AND d.kind = 'connector') AS connectors,
           (SELECT MAX(s.last_event_at) FROM agent_sessions s WHERE s.organization_id = o.id) AS last_activity
    FROM organizations o
    WHERE o.kind = 'customer'
    ORDER BY o.name
  `);
  return res.rows.map((r) => ({
    id: r.id,
    name: r.name,
    timezone: r.timezone,
    createdAt: new Date(r.created_at).toISOString(),
    disabled: r.disabled_at != null,
    administrators: r.administrators,
    users: r.users,
    employees: r.employees,
    connectors: r.connectors,
    lastActivityAt: r.last_activity ? new Date(r.last_activity).toISOString() : null,
  }));
}

async function assertEmailFree(email: string): Promise<void> {
  const used = await db.execute<{ id: string }>(
    sql`SELECT id FROM portal_users WHERE email = ${email.toLowerCase().trim()} LIMIT 1`,
  );
  if (used.rows.length) throw new Error("email_already_used");
}

async function audit(organizationId: string, actorId: string, action: string, detail: Record<string, unknown>) {
  await db.insert(auditLog).values({ organizationId, actorId, action, detail, createdAt: new Date() });
}

/** Creates a customer organisation and its first administrator. */
export async function createOrganization(input: {
  actor: { id: string; organizationId: string };
  name: string;
  timezone?: string;
  adminEmail: string;
  adminName: string;
}): Promise<{ organization: { id: string; name: string }; admin: { email: string; password: string } }> {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 120) throw new Error("invalid_name");
  const timezone = input.timezone?.trim() || "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
  } catch {
    throw new Error("invalid_timezone");
  }
  const existing = await db.execute<{ id: string }>(
    sql`SELECT id FROM organizations WHERE lower(name) = lower(${name}) LIMIT 1`,
  );
  if (existing.rows.length) throw new Error("organization_exists");
  await assertEmailFree(input.adminEmail);

  const id = randomUUID();
  await db.insert(organizations).values({ id, name, timezone, kind: "customer" });
  const password = generatePassword();
  const admin = await createPortalUser({
    organizationId: id,
    actorId: input.actor.id,
    email: input.adminEmail,
    password,
    displayName: input.adminName,
    role: "administrator",
  });
  await audit(id, input.actor.id, "platform.organization_created", { name, admin: admin.email });
  await audit(input.actor.organizationId, input.actor.id, "platform.organization_created", { organizationId: id, name });
  return { organization: { id, name }, admin: { email: admin.email, password } };
}

/** Adds another administrator to a customer organisation. */
export async function addOrganizationAdmin(input: {
  actor: { id: string; organizationId: string };
  organizationId: string;
  email: string;
  name: string;
}): Promise<{ email: string; password: string }> {
  const org = await db.select().from(organizations).where(eq(organizations.id, input.organizationId));
  if (!org[0] || org[0].kind !== "customer") throw new Error("organization_not_found");
  await assertEmailFree(input.email);
  const password = generatePassword();
  const admin = await createPortalUser({
    organizationId: input.organizationId,
    actorId: input.actor.id,
    email: input.email,
    password,
    displayName: input.name,
    role: "administrator",
  });
  await audit(input.organizationId, input.actor.id, "platform.admin_added", { email: admin.email });
  return { email: admin.email, password };
}

/** Disabling blocks every sign-in to that organisation; data is kept. */
export async function setOrganizationDisabled(input: {
  actor: { id: string; organizationId: string };
  organizationId: string;
  disabled: boolean;
}): Promise<void> {
  const updated = await db.execute<{ id: string }>(sql`
    UPDATE organizations SET disabled_at = ${input.disabled ? new Date() : null}
    WHERE id = ${input.organizationId} AND kind = 'customer'
    RETURNING id
  `);
  if (!updated.rows.length) throw new Error("organization_not_found");
  await audit(input.organizationId, input.actor.id, input.disabled ? "platform.organization_disabled" : "platform.organization_enabled", {});
}

/** The platform organisation super admins belong to (created on first use). */
export async function ensurePlatformOrganization(): Promise<string> {
  const found = await db.execute<{ id: string }>(sql`SELECT id FROM organizations WHERE kind = 'platform' LIMIT 1`);
  if (found.rows[0]) return found.rows[0].id;
  const id = randomUUID();
  await db.insert(organizations).values({ id, name: "Techlio Platform", timezone: "UTC", kind: "platform" });
  return id;
}

export async function organizationDisabled(organizationId: string): Promise<boolean> {
  const rows = await db
    .select({ disabledAt: organizations.disabledAt })
    .from(organizations)
    .where(eq(organizations.id, organizationId));
  return rows[0]?.disabledAt != null;
}
