import { createHash, randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "./db.js";
import { devices } from "./schema.js";

/**
 * Maps a provider account (Cursor email, GitHub login) to a Techlio employee.
 * Returns null when there is no confident match — callers must skip the row,
 * never fall back to some default person.
 */
export async function resolveProviderEmployee(input: {
  organizationId: string;
  provider: string;
  email?: string | null;
  login?: string | null;
}): Promise<string | null> {
  const keys = [input.email, input.login]
    .filter((v): v is string => Boolean(v))
    .map((v) => v.toLowerCase().trim());
  for (const key of keys) {
    const explicit = await db.execute<{ employee_id: string }>(sql`
      SELECT employee_id FROM employee_provider_identities
      WHERE organization_id = ${input.organizationId}
        AND provider = ${input.provider}
        AND external_id = ${key}
    `);
    if (explicit.rows[0]) return explicit.rows[0].employee_id;
  }
  if (input.email) {
    const byEmail = await db.execute<{ id: string }>(sql`
      SELECT id FROM employees
      WHERE organization_id = ${input.organizationId}
        AND lower(email) = ${input.email.toLowerCase().trim()}
      LIMIT 2
    `);
    if (byEmail.rows.length === 1) return byEmail.rows[0].id;
  }
  return null;
}

/**
 * Tier B events need a device id. This is a `provider_pull` device: it never
 * authenticates (unusable token hash) and is excluded from connector health.
 */
export async function ensureProviderPullDevice(input: {
  organizationId: string;
  employeeId: string;
  provider: string;
  label: string;
}): Promise<string> {
  const existing = await db
    .select({ id: devices.id })
    .from(devices)
    .where(
      and(
        eq(devices.organizationId, input.organizationId),
        eq(devices.developerId, input.employeeId),
        eq(devices.provider, input.provider),
        eq(devices.kind, "provider_pull"),
      ),
    );
  if (existing[0]) return existing[0].id;
  const id = randomUUID();
  await db.insert(devices).values({
    id,
    organizationId: input.organizationId,
    developerId: input.employeeId,
    // Not a sha256 of anything: this device can never authenticate.
    tokenHash: `!provider-pull:${createHash("sha256").update(id).digest("hex").slice(0, 16)}`,
    provider: input.provider,
    label: input.label,
    kind: "provider_pull",
    createdAt: new Date(),
  });
  return id;
}

/** The organisation a globally configured provider key belongs to. */
export async function resolvePullOrganization(): Promise<string | null> {
  const fromEnv = process.env.TECHLIO_PULL_ORG_ID?.trim();
  if (fromEnv) return fromEnv;
  const orgs = await db.execute<{ id: string }>(
    sql`SELECT id FROM organizations WHERE kind = 'customer' AND disabled_at IS NULL LIMIT 2`,
  );
  return orgs.rows.length === 1 ? orgs.rows[0].id : null;
}

export async function listOrganizationIds(): Promise<string[]> {
  const res = await db.execute<{ id: string }>(sql`SELECT id FROM organizations WHERE kind = 'customer'`);
  return res.rows.map((r) => r.id);
}
