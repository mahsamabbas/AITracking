/**
 * Bootstrap org portal users + connector credentials on empty production DB.
 * Uses same DATABASE_URL resolution as admin-create-prod.sh (caller sets env).
 *
 *   pnpm bootstrap:prod:access
 */
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  createPortalUser,
  db,
  listDeveloperDevices,
  pool,
  portalUsers,
  registerDevice,
} from "@techlio/server-core";

const ORG_ID = "550e8400-e29b-41d4-a716-446655440010";

function randomPortalPassword(): string {
  return `${randomBytes(16).toString("base64url")}A!`;
}

async function actorId(): Promise<string> {
  const rows = await db.select().from(portalUsers).where(eq(portalUsers.organizationId, ORG_ID));
  const row = rows.find((u) => u.role === "administrator") ?? rows[0];
  if (!row) throw new Error("No administrator in org — run pnpm admin:create:prod first.");
  return row.id;
}

async function ensureUser(input: {
  actor: string;
  email: string;
  displayName: string;
  role: "administrator" | "manager" | "developer" | "auditor";
  password?: string;
}) {
  const email = input.email.toLowerCase().trim();
  const existing = await db.select().from(portalUsers).where(eq(portalUsers.email, email));
  if (existing[0]) {
    console.log(`User already exists: ${email} (${existing[0].role})`);
    return { user: existing[0], created: false };
  }
  const password = input.password ?? randomPortalPassword();
  const user = await createPortalUser({
    organizationId: ORG_ID,
    actorId: input.actor,
    email,
    password,
    displayName: input.displayName,
    role: input.role,
  });
  console.log(`Created ${input.role}: ${email}`);
  console.log(`  Password (store now): ${password}`);
  return { user, created: true };
}

async function main() {
  const actor = await actorId();

  await ensureUser({
    actor,
    email: "admin2@techlio.co",
    displayName: "Admin Two",
    role: "administrator",
  });

  const devEmail = process.env.BOOTSTRAP_DEV_EMAIL?.trim() || "talha.dev@techlio.co";
  const { user: devUser } = await ensureUser({
    actor,
    email: devEmail,
    displayName: "Talha khilji",
    role: "developer",
  });

  const developerId = devUser.developerId;
  if (!developerId) throw new Error("Developer row missing developerId");

  const existing = await listDeveloperDevices(ORG_ID, developerId);
  if (existing.length > 0) {
    console.log(`Connector device already registered for ${devEmail} (${existing.length} active).`);
    console.log("Revoke old credentials in Connectors if you need a fresh token.");
    return;
  }

  const { deviceId, token } = await registerDevice({
    organizationId: ORG_ID,
    developerId,
    actorId: actor,
    provider: "cursor",
    label: "Cursor workstation",
  });

  console.log("");
  console.log("Connector credential:");
  console.log(`  Developer login: ${devEmail}`);
  console.log(`  Device ID: ${deviceId}`);
  console.log(`  Token (once): ${token}`);
  console.log("");
  console.log("Sign in on production as the developer → My connectors → activate.");
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => void pool.end());
