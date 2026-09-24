import { organizationDisabled } from "./platform.js";
import { desc, eq } from "drizzle-orm";
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { db } from "./db.js";
import { portalUsers, auditLog, employees } from "./schema.js";
import { ORG_ASSIGNABLE_ROLES, type OrgAssignableRole, type Role } from "./roles.js";
import { devAffordancesEnabled } from "./runtime.js";

export const DEV_ORG = "550e8400-e29b-41d4-a716-446655440010";
export const DEV_DEVELOPER_ALEX = "550e8400-e29b-41d4-a716-446655440011";
export const DEV_DEVELOPER_SAM = "550e8400-e29b-41d4-a716-446655440021";
/** Local `pnpm dev` connector identity — must match apps/connector config. */
export const DEV_DEVICE_ALEX = "550e8400-e29b-41d4-a716-446655440012";

export const DEMO_USERS: {
  email: string;
  password: string;
  displayName: string;
  role: Role;
  developerId?: string;
  id: string;
}[] = [
  {
    id: "880e8400-e29b-41d4-a716-446655440001",
    email: "manager@techlio.local",
    password: "manager123",
    displayName: "Faisal",
    role: "manager",
  },
  {
    id: "880e8400-e29b-41d4-a716-446655440002",
    email: "developer@techlio.local",
    password: "developer123",
    displayName: "Alex",
    role: "developer",
    developerId: DEV_DEVELOPER_ALEX,
  },
  {
    id: "880e8400-e29b-41d4-a716-446655440005",
    email: "sam@techlio.local",
    password: "developer123",
    displayName: "Sam",
    role: "developer",
    developerId: DEV_DEVELOPER_SAM,
  },
  {
    id: "880e8400-e29b-41d4-a716-446655440003",
    email: "admin@techlio.local",
    password: "admin123",
    displayName: "Mahsam",
    role: "administrator",
  },
  {
    id: "880e8400-e29b-41d4-a716-446655440004",
    email: "auditor@techlio.local",
    password: "auditor123",
    displayName: "Priya",
    role: "auditor",
  },
];

/** scrypt with a per-user salt: `scrypt$<saltHex>$<hashHex>`. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 32);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

/** Legacy unsalted SHA-256 hashes are still verified, then upgraded on login. */
function legacyHash(password: string): string {
  return createHash("sha256").update(`techlio:${password}`).digest("hex");
}

export function verifyPassword(password: string, stored: string): { ok: boolean; legacy: boolean } {
  if (stored.startsWith("scrypt$")) {
    const [, saltHex, hashHex] = stored.split("$");
    if (!saltHex || !hashHex) return { ok: false, legacy: false };
    const expected = Buffer.from(hashHex, "hex");
    const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
    return { ok: timingSafeEqual(actual, expected), legacy: false };
  }
  if (/^[0-9a-f]{64}$/.test(stored)) {
    const a = Buffer.from(legacyHash(password), "hex");
    const b = Buffer.from(stored, "hex");
    return { ok: timingSafeEqual(a, b), legacy: true };
  }
  return { ok: false, legacy: false }; // disabled sentinel or unknown format
}

export type PortalUserPublic = {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  organizationId: string;
  developerId: string | null;
};

export async function seedPortalUsers(): Promise<void> {
  if (!devAffordancesEnabled()) return;
  try {
    for (const u of DEMO_USERS) {
      await db
        .insert(portalUsers)
        .values({
          id: u.id,
          organizationId: DEV_ORG,
          email: u.email,
          passwordHash: hashPassword(u.password),
          displayName: u.displayName,
          role: u.role,
          developerId: u.developerId ?? null,
        })
        // Dev only: restores demo passwords that migration 008 disabled.
        .onConflictDoUpdate({
          target: portalUsers.email,
          set: { passwordHash: hashPassword(u.password) },
        });
    }
  } catch {
    /* table may not exist until migration 004 */
  }
}

export async function authenticatePortalUser(
  email: string,
  password: string,
): Promise<PortalUserPublic | null> {
  const rows = await db
    .select()
    .from(portalUsers)
    .where(eq(portalUsers.email, email.toLowerCase().trim()));
  const row = rows[0];
  const check = row ? verifyPassword(password, row.passwordHash) : { ok: false, legacy: false };
  // A disabled organisation (platform super admin switch) cannot sign in.
  if (row && check.ok && (await organizationDisabled(row.organizationId))) return null;
  if (row && check.ok) {
    if (check.legacy) {
      await db
        .update(portalUsers)
        .set({ passwordHash: hashPassword(password) })
        .where(eq(portalUsers.id, row.id));
    }
    await db.insert(auditLog).values({
      organizationId: row.organizationId,
      actorId: row.id,
      action: "auth.login",
      detail: { email: row.email, role: row.role },
      createdAt: new Date(),
    });
    if (row.developerId) {
      try {
        await ensureEmployee({
          id: row.developerId,
          organizationId: row.organizationId,
          displayName: row.displayName,
          email: row.email,
        });
      } catch {
        /* directory row is best-effort so login still succeeds */
      }
    }
    return toPublic(row);
  }

  // No hardcoded-credential fallback: a user exists in portal_users or does
  // not sign in at all.
  return null;
}

function toPublic(row: typeof portalUsers.$inferSelect): PortalUserPublic {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    role: row.role as Role,
    organizationId: row.organizationId,
    developerId: row.developerId ?? null,
  };
}

export async function listPortalUsers(
  organizationId: string,
): Promise<PortalUserPublic[]> {
  const rows = await db
    .select()
    .from(portalUsers)
    .where(eq(portalUsers.organizationId, organizationId));
  return rows.map(toPublic);
}

export async function createPortalUser(input: {
  organizationId: string;
  actorId: string;
  email: string;
  password: string;
  displayName: string;
  role: OrgAssignableRole;
  developerId?: string | null;
}): Promise<PortalUserPublic> {
  if (!ORG_ASSIGNABLE_ROLES.includes(input.role)) {
    throw new Error("invalid_role");
  }
  const id = randomUUID();
  const email = input.email.toLowerCase().trim();
  const developerId =
    input.role === "developer"
      ? (input.developerId ?? randomUUID())
      : null;
  await db.insert(portalUsers).values({
    id,
    organizationId: input.organizationId,
    email,
    passwordHash: hashPassword(input.password),
    displayName: input.displayName.trim(),
    role: input.role,
    developerId,
  });
  if (developerId) {
    await ensureEmployee({
      id: developerId,
      organizationId: input.organizationId,
      displayName: input.displayName.trim(),
      email,
    });
  }
  await db.insert(auditLog).values({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: "users.create",
    detail: { email, role: input.role },
    createdAt: new Date(),
  });
  return {
    id,
    email,
    displayName: input.displayName.trim(),
    role: input.role,
    organizationId: input.organizationId,
    developerId,
  };
}

/** Directory row the analytics screens join on. Login alone is not enough. */
export async function ensureEmployee(input: {
  id: string;
  organizationId: string;
  displayName: string;
  email?: string | null;
}): Promise<void> {
  await db
    .insert(employees)
    .values({
      id: input.id,
      organizationId: input.organizationId,
      displayName: input.displayName,
      email: input.email ?? null,
      status: "active",
      joinedAt: new Date(),
      createdAt: new Date(),
    })
    .onConflictDoNothing();
}

export async function listAuditLog(
  organizationId: string,
  limit = 100,
): Promise<(typeof auditLog.$inferSelect)[]> {
  return db
    .select()
    .from(auditLog)
    .where(eq(auditLog.organizationId, organizationId))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}

export function getOrgPolicy() {
  const retentionEventsDays = Number(process.env.RETENTION_DAYS ?? 90);
  return {
    timezone: process.env.ORG_TIMEZONE ?? "UTC",
    retentionEventsDays,
    retentionSummariesDays: 365,
    staleHeartbeatMinutes: 5,
    idleThresholdMinutes: 10,
    monitoringNoticeStatus: "draft" as const,
    notificationRules: [
      "stale_connector",
      "upload_failed",
      "unsupported_version",
      "unassigned_session",
      "summary_failed",
    ],
  };
}
