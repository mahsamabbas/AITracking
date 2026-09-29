import { pool } from "./db.js";

/**
 * The newest infra/sql migration this build's code depends on. The API reports
 * whether the database has it, so a deploy that skipped `pnpm db:migrate:prod`
 * shows up as a clear health warning and 503s instead of opaque 500s.
 * A unit test keeps this in step with the last file in infra/sql.
 */
export const EXPECTED_SCHEMA_MIGRATION = "017_connector_remote_pause.sql";

export async function schemaStatus(): Promise<{
  expected: string;
  applied: string | null;
  upToDate: boolean;
}> {
  try {
    const res = await pool.query<{ name: string }>(
      "SELECT name FROM schema_migrations ORDER BY name DESC LIMIT 1",
    );
    const applied = res.rows[0]?.name ?? null;
    return {
      expected: EXPECTED_SCHEMA_MIGRATION,
      applied,
      upToDate: applied != null && applied >= EXPECTED_SCHEMA_MIGRATION,
    };
  } catch {
    return { expected: EXPECTED_SCHEMA_MIGRATION, applied: null, upToDate: false };
  }
}

/** Postgres "undefined column" / "undefined table": code ahead of schema. */
export function isSchemaDriftError(err: unknown): boolean {
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code: unknown }).code)
      : (err as { cause?: { code?: string } })?.cause?.code;
  return code === "42703" || code === "42P01";
}
