import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

/**
 * Schema is owned by `infra/sql/*.sql` and applied with `pnpm db:migrate`.
 * The runtime never creates tables on boot.
 */
export function resolveDatabaseConnectionString(): string {
  const fromEnv =
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

export async function isDatabaseReady(): Promise<boolean> {
  try {
    await pool.query("SELECT 1 FROM employees LIMIT 1");
    return true;
  } catch {
    return false;
  }
}
