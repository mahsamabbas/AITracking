import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

/**
 * Schema is owned by `infra/sql/*.sql` and applied with `pnpm db:migrate`.
 * The runtime never creates tables on boot.
 */
export function resolveDatabaseConnectionString(): string {
  // TECHLIO_DATABASE_URL wins: hosting integrations (e.g. Neon on Vercel)
  // inject their own DATABASE_URL into every deployment and would override ours.
  const fromEnv =
    process.env.TECHLIO_DATABASE_URL ??
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL ??
    process.env.POSTGRES_PRISMA_URL;
  if (fromEnv) return fromEnv;
  if (process.env.VERCEL) {
    throw new Error(
      "DATABASE_URL or POSTGRES_URL is missing on Vercel. Set the Supabase pooler URL (port 6543) and redeploy.",
    );
  }
  return "postgres://techlio:techlio@localhost:5432/techlio_activity";
}

function poolOptions(): pg.PoolConfig {
  const connectionString = resolveDatabaseConnectionString();
  try {
    const u = new URL(connectionString);
    if (u.searchParams.get("sslmode") === "disable") return { connectionString };
    if (["localhost", "127.0.0.1", "postgres"].includes(u.hostname)) return { connectionString };
    // pg v8 maps sslmode=require to verify-full, which ignores rejectUnauthorized: false.
    u.searchParams.delete("sslmode");
    return { connectionString: u.toString(), ssl: { rejectUnauthorized: false } };
  } catch {
    /* fall through */
  }
  return { connectionString, ssl: { rejectUnauthorized: false } };
}

export const pool = new pg.Pool(poolOptions());

export const db = drizzle(pool, { schema });

/** Which env var supplied the connection string (never its value). */
function connectionSource(): string {
  if (process.env.TECHLIO_DATABASE_URL) return "TECHLIO_DATABASE_URL";
  if (process.env.DATABASE_URL) return "DATABASE_URL";
  if (process.env.POSTGRES_URL) return "POSTGRES_URL";
  if (process.env.POSTGRES_PRISMA_URL) return "POSTGRES_PRISMA_URL";
  return "default";
}

/**
 * Health detail for outages: the database host this process connects to and
 * the last error, without credentials — so "which database, and why not" is
 * answerable from /v1/health instead of guessed.
 */
export async function databaseCheck(): Promise<{ ok: boolean; source: string; host: string; error?: string }> {
  const cs = (pool.options as { connectionString?: string }).connectionString ?? "";
  let host = "unknown";
  try {
    host = new URL(cs).hostname || `none (falls back to PGHOST=${process.env.PGHOST ?? "unset"})`;
  } catch {
    host = "unparseable connection string";
  }
  try {
    await pool.query("SELECT 1 FROM employees LIMIT 1");
    return { ok: true, source: connectionSource(), host };
  } catch (err) {
    const e = err as { code?: string; message?: string };
    return { ok: false, source: connectionSource(), host, error: `${e.code ?? ""} ${e.message ?? ""}`.trim().slice(0, 160) };
  }
}

export async function isDatabaseReady(): Promise<boolean> {
  try {
    await pool.query("SELECT 1 FROM employees LIMIT 1");
    return true;
  } catch {
    return false;
  }
}
