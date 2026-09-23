/**
 * Production bootstrap: create (or reset) an administrator without any
 * default credential ever existing.
 *
 *   DATABASE_URL=... pnpm admin:create --email you@company.com --name "Your Name"
 *
 * Platform super admin (creates and manages organisations; sees no
 * organisation's activity). Use an email that is not an organisation account:
 *   DATABASE_URL=... pnpm admin:create --super --email platform@company.com
 *
 * The password is read from ADMIN_PASSWORD, or generated and printed once.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { auditLog, db, ensurePlatformOrganization, hashPassword, pool, portalUsers } from "@techlio/server-core";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = arg("email")?.toLowerCase().trim();
  const displayName = arg("name")?.trim() ?? "Administrator";
  const orgName = arg("org") ?? "Techlio";
  if (!email || !email.includes("@")) {
    throw new Error("Usage: pnpm admin:create --email you@company.com [--name \"Name\"] [--org \"Org\"]");
  }
  const generated = !process.env.ADMIN_PASSWORD;
  const password = process.env.ADMIN_PASSWORD ?? randomBytes(18).toString("base64url");
  if (password.length < 12) throw new Error("ADMIN_PASSWORD must be at least 12 characters");

  const superAdmin = process.argv.includes("--super");
  const role = superAdmin ? "super_admin" : "administrator";
  const existing = await db.select().from(portalUsers).where(eq(portalUsers.email, email));
  if (superAdmin && existing[0] && existing[0].role !== "super_admin") {
    throw new Error(`${email} already belongs to an organisation. Use a separate email for the platform super admin.`);
  }

  let organizationId: string | undefined;
  if (superAdmin) {
    organizationId = await ensurePlatformOrganization();
  } else {
    // Single-tenant deployments reuse the one organisation; otherwise pass --org-id or create one.
    const orgs = await db.execute<{ id: string }>(
      sql`SELECT id FROM organizations WHERE kind = 'customer' ORDER BY name LIMIT 2`,
    );
    organizationId = arg("org-id") ?? (orgs.rows.length === 1 ? orgs.rows[0].id : undefined);
    if (!organizationId) {
      organizationId = randomUUID();
      await db.execute(sql`INSERT INTO organizations (id, name) VALUES (${organizationId}, ${orgName})`);
    }
  }

  const id = existing[0]?.id ?? randomUUID();
  if (existing[0]) {
    await db
      .update(portalUsers)
      .set({ passwordHash: hashPassword(password), role })
      .where(eq(portalUsers.id, id));
  } else {
    await db.insert(portalUsers).values({
      id,
      organizationId,
      email,
      passwordHash: hashPassword(password),
      displayName,
      role,
      developerId: null,
    });
  }
  await db.insert(auditLog).values({
    organizationId,
    actorId: id,
    action: existing[0] ? "users.admin_reset_cli" : "users.admin_create_cli",
    detail: { email },
    createdAt: new Date(),
  });

  console.log(
    `${superAdmin ? "Platform super admin" : "Administrator"} ${existing[0] ? "reset" : "created"}: ${email} (org ${organizationId})`,
  );
  if (generated) console.log(`Password (shown once, store it now): ${password}`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => void pool.end());
