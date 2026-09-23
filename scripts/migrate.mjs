#!/usr/bin/env node
/**
 * Applies every infra/sql/*.sql file in filename order exactly once.
 * Tracked in schema_migrations so repeated runs are cheap and safe.
 *
 * Production: reads apps/api/.env.production.local (vercel env pull) without
 * bash `source`, which mangles `$` / special chars in passwords.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sqlDir = join(root, "infra", "sql");

// Local by default. Production env files are only read with --production
// (used by scripts/migrate-prod.sh), so a routine `pnpm db:migrate` can never
// migrate the production database by accident.
const PRODUCTION = process.argv.includes("--production");
const ENV_CANDIDATES = PRODUCTION
  ? [
      join(root, "apps/api/.env.production.local"),
      join(root, ".vercel-api/.env.local"),
    ]
  : [join(root, "apps/api/.env.local")];

function parseDotenv(filePath) {
  const out = {};
  const text = readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim().replace(/^export\s+/, "");
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    val = val.replace(/\\n/g, "\n").replace(/\\"/g, '"');
    out[key] = val;
  }
  return out;
}

function stripWrappingQuotes(value) {
  let v = (value ?? "").trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }
  return v;
}

function looksLikePlaceholder(value) {
  const v = stripWrappingQuotes(value).trim();
  if (!v) return true;
  const lower = v.toLowerCase();
  if (lower === "[sensitive]" || lower === "<sensitive>" || lower === "redacted") return true;
  if (/user:pass@host/i.test(v)) return true;
  if (/^postgresql?:\/\/user:pass@host/i.test(v)) return true;
  return false;
}

function normalizeDsn(raw) {
  let u = stripWrappingQuotes(raw);
  u = u.replace(/^prisma\+/, "");
  if (u.startsWith("postgres://") || u.startsWith("postgresql://")) return u;
  return null;
}

function dsnIsParseable(dsn) {
  try {
    const parsed = new URL(dsn);
    return Boolean(parsed.hostname) && ["postgres:", "postgresql:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

/** Split a postgres DSN even when the password contains @ : / # (new URL() fails). */
/** Local Postgres (Docker) has no TLS; hosted Postgres requires it. */
function sslFor(dsn) {
  try {
    const u = new URL(dsn);
    if (u.searchParams.get("sslmode") === "disable") return false;
    if (["localhost", "127.0.0.1", "::1", "postgres"].includes(u.hostname)) return false;
  } catch {
    /* fall through */
  }
  return { rejectUnauthorized: false };
}

function parsePostgresDsn(raw) {
  const dsn = normalizeDsn(raw);
  if (!dsn) return null;
  // A real postgres:// URL is never a docs placeholder, even if the host
  // starts with "host" (user:pass@hostname would match a naive "@host" check).
  if (looksLikePlaceholder(dsn) && !/^postgres(ql)?:\/\//i.test(dsn)) return null;
  if (dsnIsParseable(dsn)) {
    const parsed = new URL(dsn);
    const database = decodeURIComponent(parsed.pathname.replace(/^\//, "")).split("?")[0];
    return {
      host: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : 5432,
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      database: database || "neondb",
      ssl: sslFor(dsn),
    };
  }
  const match = dsn.match(
    /^(?:postgres|postgresql):\/\/([^:/?#]+):(.+)@(\[[^\]]+\]|[^:/?#]+)(?::(\d+))?\/([^?]*)/i,
  );
  if (!match) return null;
  try {
    return {
      host: match[3].replace(/^\[|\]$/g, ""),
      port: match[4] ? Number(match[4]) : 5432,
      user: decodeURIComponent(match[1]),
      password: decodeURIComponent(match[2]),
      database: decodeURIComponent(match[5] || "neondb"),
      ssl: { rejectUnauthorized: false },
    };
  } catch {
    return {
      host: match[3].replace(/^\[|\]$/g, ""),
      port: match[4] ? Number(match[4]) : 5432,
      user: match[1],
      password: match[2],
      database: match[5] || "neondb",
      ssl: { rejectUnauthorized: false },
    };
  }
}

function mergeEnvFromFiles() {
  const merged = {};
  // Prefer process env first (vercel env run). Do not let a redacted
  // .env.production.local overwrite a real DATABASE_URL.
  for (const [k, v] of Object.entries(process.env)) {
    if (v && !looksLikePlaceholder(v)) merged[k] = v;
  }
  const extra = process.env.TECHLIO_ENV_FILE;
  const files = extra ? [extra, ...ENV_CANDIDATES] : ENV_CANDIDATES;
  for (const file of files) {
    if (!file || !existsSync(file)) continue;
    const parsed = parseDotenv(file);
    for (const [k, v] of Object.entries(parsed)) {
      if (!v || looksLikePlaceholder(v)) continue;
      if (merged[k] == null || merged[k] === "") merged[k] = v;
    }
    if (!merged.__TECHLIO_ENV_FILE) merged.__TECHLIO_ENV_FILE = file;
  }
  return merged;
}

function poolConfigFromEnv(env) {
  const envFile = env.__TECHLIO_ENV_FILE ?? "(process env)";
  const dsnKeys = [
    "DATABASE_URL_UNPOOLED",
    "POSTGRES_URL_NON_POOLING",
    "POSTGRES_URL",
    "DATABASE_URL",
    "POSTGRES_PRISMA_URL",
    "POSTGRES_URL_NO_SSL",
  ];

  for (const key of dsnKeys) {
    const raw = stripWrappingQuotes(env[key] || "");
    if (!/^postgres(ql)?:\/\//i.test(raw)) continue;
    const parsed = parsePostgresDsn(raw);
    if (parsed) return { ...parsed, source: key, envFile };
    return {
      connectionString: raw,
      ssl: { rejectUnauthorized: false },
      source: key,
      envFile,
    };
  }

  const host = stripWrappingQuotes(env.PGHOST_UNPOOLED || env.PGHOST || env.POSTGRES_HOST || "");
  const user = stripWrappingQuotes(env.PGUSER || env.POSTGRES_USER || "");
  const password = stripWrappingQuotes(env.PGPASSWORD || env.POSTGRES_PASSWORD || "");
  const database = stripWrappingQuotes(env.PGDATABASE || env.POSTGRES_DATABASE || "");
  const port = Number(stripWrappingQuotes(env.PGPORT || "5432")) || 5432;

  if (
    host &&
    user &&
    password &&
    database &&
    !looksLikePlaceholder(host) &&
    !host.startsWith("http")
  ) {
    return {
      host,
      port,
      user,
      password,
      database,
      ssl: { rejectUnauthorized: false },
      source: "PGHOST/PGUSER/PGPASSWORD/PGDATABASE",
      envFile,
    };
  }

  // Only a variable that is *set* to a placeholder counts; unset is not an error.
  const placeholderOnly = dsnKeys.some((key) => Boolean(env[key]) && looksLikePlaceholder(env[key]));
  return {
    host: "localhost",
    port: 5432,
    user: "techlio",
    password: "techlio",
    database: "techlio_activity",
    source: placeholderOnly ? "placeholder env file" : "local default",
    envFile,
  };
}

function describeConfig(cfg) {
  if (cfg.connectionString && !cfg.host) {
    return `source=${cfg.source} file=${cfg.envFile} (connectionString)`;
  }
  return `source=${cfg.source} file=${cfg.envFile} host=${cfg.host} db=${cfg.database}`;
}

const checkOnly = process.argv.includes("--check");
const env = mergeEnvFromFiles();
const config = poolConfigFromEnv(env);

if (checkOnly) {
  console.log(describeConfig(config));
  const keys = [
    "DATABASE_URL",
    "DATABASE_URL_UNPOOLED",
    "POSTGRES_URL",
    "POSTGRES_URL_NON_POOLING",
    "POSTGRES_PRISMA_URL",
    "PGHOST",
    "PGHOST_UNPOOLED",
    "PGUSER",
    "PGDATABASE",
  ];
  for (const key of keys) {
    const raw = env[key];
    if (!raw) {
      console.log(`  ${key}: (empty)`);
      continue;
    }
    const parsed = parsePostgresDsn(raw);
    if (parsed) console.log(`  ${key}: usable postgres (${parsed.host})`);
    else if (looksLikePlaceholder(raw)) console.log(`  ${key}: placeholder — skipped`);
    else if (key.startsWith("PG") && !raw.includes("://")) console.log(`  ${key}: set (connection field)`);
    else console.log(`  ${key}: set but not a usable postgres DSN`);
  }
  process.exit(0);
}

if (config.source === "placeholder env file" && !PRODUCTION) {
  console.warn(
    "WARN: apps/api/.env.local holds placeholder values (e.g. [SENSITIVE]); using the local Docker Postgres instead.",
  );
  config.source = "local default";
}

if (config.source === "placeholder env file") {
  const bad = ["DATABASE_URL", "POSTGRES_URL"].find((k) =>
    looksLikePlaceholder(env[k] ?? ""),
  );
  console.error("ERROR: No usable Postgres URL in the process environment.");
  if (bad) {
    console.error(
      `       ${bad} is set to a placeholder (often literal "[SENSITIVE]" in apps/api/.env.local).`,
    );
    console.error("       Delete those files and re-pull in Terminal.app, or export a real DATABASE_URL.");
  }
  console.error("  pnpm db:migrate:prod");
  console.error("  See: scripts/migrate-prod.sh");
  process.exit(1);
}

if (config.source === "local default" && PRODUCTION) {
  console.error("ERROR: --production was given but no production Postgres URL was found. Refusing to fall back to localhost.");
  process.exit(1);
}

const { source: _source, envFile: _envFile, ...poolOptions } = config;
const pool = new pg.Pool(poolOptions);

async function main() {
  console.log(`==> Migrate (${describeConfig(config)})`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const { rows } = await pool.query("SELECT name FROM schema_migrations");
  const applied = new Set(rows.map((r) => r.name));

  const files = readdirSync(sqlDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(sqlDir, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [
        file,
      ]);
      await client.query("COMMIT");
      console.log(`  applied ${file}`);
      ran++;
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(`  FAILED  ${file}\n${err.message}`);
      process.exitCode = 1;
      return;
    } finally {
      client.release();
    }
  }

  console.log(
    ran === 0
      ? `Schema up to date (${files.length} migrations).`
      : `Applied ${ran} migration(s).`,
  );
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
