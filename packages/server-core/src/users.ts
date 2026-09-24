import { organizationDisabled } from "./platform.js";
import { desc, eq, sql } from "drizzle-orm";
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { db, pool } from "./db.js";
import { portalUsers, auditLog, employees } from "./schema.js";
import { ORG_ASSIGNABLE_ROLES, type OrgAssignableRole, type Role } from "./roles.js";
import { devAffordancesEnabled } from "./runtime.js";
import { resolveOrgTimezone, timezoneFromEnv } from "./timezone.js";

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

export type PortalEmployeeDirectory = {
  team: string | null;
  title: string | null;
  status: string;
  joinedAt: string | null;
};

export type PortalUserPublic = {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  organizationId: string;
  developerId: string | null;
  avatarUrl: string | null;
  /** Present when this sign-in account is linked to a monitored employee row. */
  employee: PortalEmployeeDirectory | null;
};

export async function seedPortalUsers(): Promise<void> {
  if (!devAffordancesEnabled()) return;
  try {
    for (const u of DEMO_USERS) {
      const hash = hashPassword(u.password);
      await db
        .insert(portalUsers)
        .values({
          id: u.id,
          organizationId: DEV_ORG,
          email: u.email,
          passwordHash: hash,
          displayName: u.displayName,
          role: u.role,
          developerId: u.developerId ?? null,
        })
        // Dev only: restores demo passwords that migration 008 disabled.
        .onConflictDoUpdate({
          target: portalUsers.email,
          set: {
            passwordHash: hash,
            displayName: u.displayName,
            role: u.role,
            developerId: u.developerId ?? null,
            organizationId: DEV_ORG,
          },
        });
    }
    // Migration 008 sets `!disabled-default-credential` — refresh any demo row left disabled.
    for (const u of DEMO_USERS) {
      await db
        .update(portalUsers)
        .set({ passwordHash: hashPassword(u.password) })
        .where(eq(portalUsers.email, u.email));
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
    return attachEmployeeDirectory(toPublic(row));
  }

  // No hardcoded-credential fallback: a user exists in portal_users or does
  // not sign in at all.
  return null;
}

function toPublic(row: typeof portalUsers.$inferSelect): Omit<PortalUserPublic, "employee"> {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    role: row.role as Role,
    organizationId: row.organizationId,
    developerId: row.developerId ?? null,
    avatarUrl: row.avatarUrl ?? null,
  };
}

async function attachEmployeeDirectory(
  base: Omit<PortalUserPublic, "employee">,
): Promise<PortalUserPublic> {
  if (!base.developerId) return { ...base, employee: null };
  const rows = await db
    .select({
      team: employees.team,
      title: employees.title,
      status: employees.status,
      joinedAt: employees.joinedAt,
    })
    .from(employees)
    .where(eq(employees.id, base.developerId))
    .limit(1);
  const e = rows[0];
  if (!e) return { ...base, employee: null };
  return {
    ...base,
    employee: {
      team: e.team ?? null,
      title: e.title ?? null,
      status: e.status,
      joinedAt: e.joinedAt ? e.joinedAt.toISOString() : null,
    },
  };
}

export async function getPortalUserById(id: string): Promise<PortalUserPublic | null> {
  const rows = await db.select().from(portalUsers).where(eq(portalUsers.id, id)).limit(1);
  if (!rows[0]) return null;
  return attachEmployeeDirectory(toPublic(rows[0]));
}

export async function updatePortalProfile(
  userId: string,
  input: {
    email?: string;
    displayName?: string;
    avatarUrl?: string | null;
    team?: string | null;
    title?: string | null;
  },
): Promise<PortalUserPublic> {
  const rows = await db.select().from(portalUsers).where(eq(portalUsers.id, userId)).limit(1);
  const row = rows[0];
  if (!row) throw new Error("user_not_found");

  const nextEmail = input.email !== undefined ? input.email.toLowerCase().trim() : undefined;
  const nextName = input.displayName !== undefined ? input.displayName.trim() : undefined;
  if (nextEmail !== undefined && !nextEmail.includes("@")) throw new Error("invalid_email");
  if (nextName !== undefined && (nextName.length < 1 || nextName.length > 120)) {
    throw new Error("invalid_name");
  }

  const normOptional = (v: string | null | undefined): string | null | undefined => {
    if (v === undefined) return undefined;
    if (v === null) return null;
    const t = v.trim();
    return t.length ? t.slice(0, 120) : null;
  };
  const nextTeam = normOptional(input.team);
  const nextTitle = normOptional(input.title);
  if (nextTeam !== undefined && nextTeam && nextTeam.length > 120) throw new Error("invalid_team");
  if (nextTitle !== undefined && nextTitle && nextTitle.length > 120) throw new Error("invalid_title");

  if (nextEmail && nextEmail !== row.email) {
    const used = await db
      .select({ id: portalUsers.id })
      .from(portalUsers)
      .where(eq(portalUsers.email, nextEmail))
      .limit(1);
    if (used[0] && used[0].id !== userId) throw new Error("email_already_used");
  }

  const patch: Partial<typeof portalUsers.$inferInsert> = {};
  if (nextEmail !== undefined) patch.email = nextEmail;
  if (nextName !== undefined) patch.displayName = nextName;
  if (input.avatarUrl !== undefined) patch.avatarUrl = input.avatarUrl;

  if (Object.keys(patch).length) {
    await db.update(portalUsers).set(patch).where(eq(portalUsers.id, userId));
  }

  if (row.developerId && (nextEmail !== undefined || nextName !== undefined)) {
    await db
      .update(employees)
      .set({
        ...(nextEmail !== undefined ? { email: nextEmail } : {}),
        ...(nextName !== undefined ? { displayName: nextName } : {}),
      })
      .where(eq(employees.id, row.developerId));
  }

  if (
    row.developerId &&
    (nextTeam !== undefined || nextTitle !== undefined)
  ) {
    await db
      .update(employees)
      .set({
        ...(nextTeam !== undefined ? { team: nextTeam } : {}),
        ...(nextTitle !== undefined ? { title: nextTitle } : {}),
      })
      .where(eq(employees.id, row.developerId));
  }

  await db.insert(auditLog).values({
    organizationId: row.organizationId,
    actorId: userId,
    action: "profile.update",
    detail: {
      email: nextEmail !== undefined,
      displayName: nextName !== undefined,
      avatar: input.avatarUrl !== undefined,
      team: nextTeam !== undefined,
      title: nextTitle !== undefined,
    },
    createdAt: new Date(),
  });

  const updated = await getPortalUserById(userId);
  if (!updated) throw new Error("user_not_found");
  return updated;
}

export async function changePortalPassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  if (newPassword.length < 8) throw new Error("password_too_short");
  const rows = await db.select().from(portalUsers).where(eq(portalUsers.id, userId)).limit(1);
  const row = rows[0];
  if (!row) throw new Error("user_not_found");
  const check = verifyPassword(currentPassword, row.passwordHash);
  if (!check.ok) throw new Error("invalid_password");
  await db
    .update(portalUsers)
    .set({ passwordHash: hashPassword(newPassword) })
    .where(eq(portalUsers.id, userId));
  await db.insert(auditLog).values({
    organizationId: row.organizationId,
    actorId: userId,
    action: "profile.password_changed",
    detail: {},
    createdAt: new Date(),
  });
}

export async function listPortalUsers(
  organizationId: string,
): Promise<PortalUserPublic[]> {
  const rows = await db
    .select()
    .from(portalUsers)
    .where(eq(portalUsers.organizationId, organizationId));
  return Promise.all(rows.map((r) => attachEmployeeDirectory(toPublic(r))));
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
  return attachEmployeeDirectory({
    id,
    email,
    displayName: input.displayName.trim(),
    role: input.role,
    organizationId: input.organizationId,
    developerId,
    avatarUrl: null,
  });
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

export async function getOrgPolicy(organizationId: string) {
  const retentionEventsDays = Number(process.env.RETENTION_DAYS ?? 90);
  const timezone = await resolveOrgTimezone(organizationId);
  return {
    timezone,
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

/** @deprecated Use {@link getOrgPolicy} with an organisation id. */
export function getOrgPolicySync() {
  const retentionEventsDays = Number(process.env.RETENTION_DAYS ?? 90);
  return {
    timezone: timezoneFromEnv(),
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

export interface EmployeeDeleteSummary {
  employeeId: string;
  displayName: string;
  portalUsersRemoved: number;
  devicesRemoved: number;
  sessionsRemoved: number;
  contextVersionsRemoved: number;
  eventsRemoved: number;
  hourlySnapshotsRemoved: number;
  providerIdentitiesRemoved: number;
}

/** Permanently removes a monitored person and all telemetry for their developer_id. */
export async function deleteEmployeeWithData(input: {
  organizationId: string;
  employeeId: string;
  actorId: string;
}): Promise<EmployeeDeleteSummary> {
  const { organizationId, employeeId, actorId } = input;

  const row = await db.execute<{ display_name: string }>(sql`
    SELECT display_name FROM employees
    WHERE id = ${employeeId} AND organization_id = ${organizationId}
    LIMIT 1
  `);
  const displayName = row.rows[0]?.display_name;
  if (!displayName) throw new Error("employee_not_found");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const ctx = await client.query(
      `DELETE FROM session_context_versions
       WHERE organization_id = $1
         AND session_id IN (
           SELECT id FROM agent_sessions
           WHERE organization_id = $1 AND developer_id = $2
         )`,
      [organizationId, employeeId],
    );

    const sessions = await client.query(
      `DELETE FROM agent_sessions
       WHERE organization_id = $1 AND developer_id = $2`,
      [organizationId, employeeId],
    );

    const events = await client.query(
      `DELETE FROM activity_events
       WHERE organization_id = $1 AND developer_id = $2`,
      [organizationId, employeeId],
    );

    const hourly = await client.query(
      `DELETE FROM hourly_snapshots
       WHERE organization_id = $1 AND developer_id = $2`,
      [organizationId, employeeId],
    );

    await client.query(
      `DELETE FROM connector_health
       WHERE organization_id = $1
         AND device_id IN (
           SELECT id FROM devices WHERE organization_id = $1 AND developer_id = $2
         )`,
      [organizationId, employeeId],
    );

    const devices = await client.query(
      `DELETE FROM devices WHERE organization_id = $1 AND developer_id = $2`,
      [organizationId, employeeId],
    );

    const identities = await client.query(
      `DELETE FROM employee_provider_identities
       WHERE organization_id = $1 AND employee_id = $2`,
      [organizationId, employeeId],
    );

    const portalUsersRemoved = await client.query(
      `DELETE FROM portal_users
       WHERE organization_id = $1 AND developer_id = $2`,
      [organizationId, employeeId],
    );

    const emp = await client.query(
      `DELETE FROM employees WHERE organization_id = $1 AND id = $2`,
      [organizationId, employeeId],
    );

    if ((emp.rowCount ?? 0) < 1) {
      throw new Error("employee_not_found");
    }

    await client.query(
      `INSERT INTO audit_log (organization_id, actor_id, action, detail, created_at)
       VALUES ($1, $2, $3, $4::jsonb, NOW())`,
      [
        organizationId,
        actorId,
        "employees.delete",
        JSON.stringify({
          employeeId,
          displayName,
          portalUsersRemoved: portalUsersRemoved.rowCount ?? 0,
          devicesRemoved: devices.rowCount ?? 0,
          sessionsRemoved: sessions.rowCount ?? 0,
          eventsRemoved: events.rowCount ?? 0,
          hourlySnapshotsRemoved: hourly.rowCount ?? 0,
        }),
      ],
    );

    await client.query("COMMIT");

    return {
      employeeId,
      displayName,
      portalUsersRemoved: portalUsersRemoved.rowCount ?? 0,
      devicesRemoved: devices.rowCount ?? 0,
      sessionsRemoved: sessions.rowCount ?? 0,
      contextVersionsRemoved: ctx.rowCount ?? 0,
      eventsRemoved: events.rowCount ?? 0,
      hourlySnapshotsRemoved: hourly.rowCount ?? 0,
      providerIdentitiesRemoved: identities.rowCount ?? 0,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
