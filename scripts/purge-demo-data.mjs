#!/usr/bin/env node
/**
 * Removes the seeded demo people (every employee whose email ends in
 * @techlio.local — Alex Rivera, Sam Okafor, Mei Tanaka, …) and everything
 * recorded for them: events, sessions, hourly snapshots, devices, connector
 * health, provider identities, and their developer logins.
 *
 * Real people (any other email domain) are never touched. Demo manager /
 * administrator / auditor logins are kept (migration 008 already disabled
 * their passwords) so nobody is locked out; delete them from Access if wanted.
 *
 *   node scripts/purge-demo-data.mjs                 # dry run: lists what would go
 *   node scripts/purge-demo-data.mjs --confirm       # deletes, in one transaction
 *
 * Production: export the Neon URL first (see docs/DEPLOY.md), then add --production:
 *   read -rs DATABASE_URL && export DATABASE_URL
 *   node scripts/purge-demo-data.mjs --production            # dry run
 *   node scripts/purge-demo-data.mjs --production --confirm
 */
import pg from "pg";

const PRODUCTION = process.argv.includes("--production");
const CONFIRM = process.argv.includes("--confirm");
const DEMO_DOMAIN = "%@techlio.local";

const looksReal = (url) => Boolean(url) && /^postgres(ql)?:\/\//.test(url) && !url.includes("[SENSITIVE]");

/** Reads a line from the terminal without echoing it (the URL contains a password). */
function askHidden(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let value = "";
    const onData = (ch) => {
      if (ch === "\r" || ch === "\n" || ch === "\u0004") {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.off("data", onData);
        process.stdout.write("\n");
        resolve(value.trim());
      } else if (ch === "\u0003") {
        process.stdout.write("\n");
        process.exit(130);
      } else if (ch === "\u007f") {
        value = value.slice(0, -1);
      } else {
        value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

let dsn = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (PRODUCTION && !looksReal(dsn) && process.stdin.isTTY) {
  dsn = await askHidden("Paste the Neon connection string (postgresql://…, hidden): ");
}
if (PRODUCTION && !looksReal(dsn)) {
  console.error(
    "--production needs the Neon connection string: run this in your own terminal to be prompted for it,\n" +
      "or export DATABASE_URL first. Nothing was changed.",
  );
  process.exit(1);
}
const connectionString = looksReal(dsn) ? dsn : "postgres://techlio:techlio@localhost:5432/techlio_activity";
const local = /@(localhost|127\.0\.0\.1|postgres)(:|\/)/.test(connectionString) || connectionString.includes("sslmode=disable");
const client = new pg.Client({ connectionString, ssl: local ? false : { rejectUnauthorized: false } });

const host = new URL(connectionString).host;

async function main() {
  await client.connect();
  const people = (
    await client.query(
      `SELECT id, display_name, email FROM employees WHERE email ILIKE $1 ORDER BY display_name`,
      [DEMO_DOMAIN],
    )
  ).rows;
  const kept = (
    await client.query(
      `SELECT display_name, email FROM employees WHERE email IS NULL OR email NOT ILIKE $1 ORDER BY display_name`,
      [DEMO_DOMAIN],
    )
  ).rows;

  console.log(`==> Demo data on ${host}${CONFIRM ? "" : " (dry run)"}`);
  console.log(`Remove ${people.length} demo people:`);
  for (const p of people) console.log(`  - ${p.display_name} <${p.email}>`);
  console.log(`Keep ${kept.length} people:`);
  for (const p of kept) console.log(`  + ${p.display_name} <${p.email ?? "no email"}>`);
  if (people.length === 0) return;

  const ids = people.map((p) => p.id);
  const counts = {};
  const count = async (label, sqlText) => {
    counts[label] = Number((await client.query(sqlText, [ids])).rows[0].n);
  };
  await count("activity_events", `SELECT COUNT(*) n FROM activity_events WHERE developer_id = ANY($1)`);
  await count("agent_sessions", `SELECT COUNT(*) n FROM agent_sessions WHERE developer_id = ANY($1)`);
  await count("hourly_snapshots", `SELECT COUNT(*) n FROM hourly_snapshots WHERE developer_id = ANY($1)`);
  await count("devices", `SELECT COUNT(*) n FROM devices WHERE developer_id = ANY($1)`);
  await count("developer logins", `SELECT COUNT(*) n FROM portal_users WHERE developer_id = ANY($1) AND role = 'developer'`);
  console.log("Rows:", counts);

  if (!CONFIRM) {
    console.log("\nDry run only. Re-run with --confirm to delete these rows.");
    return;
  }

  await client.query("BEGIN");
  try {
    const run = (sqlText) => client.query(sqlText, [ids]);
    await run(`DELETE FROM session_context_versions WHERE session_id IN (SELECT id FROM agent_sessions WHERE developer_id = ANY($1))`);
    await run(`DELETE FROM activity_events WHERE developer_id = ANY($1)`);
    await run(`DELETE FROM agent_sessions WHERE developer_id = ANY($1)`);
    await run(`DELETE FROM hourly_snapshots WHERE developer_id = ANY($1)`);
    await run(`DELETE FROM connector_health WHERE device_id IN (SELECT id FROM devices WHERE developer_id = ANY($1))`);
    await run(`DELETE FROM devices WHERE developer_id = ANY($1)`);
    await run(`DELETE FROM employee_provider_identities WHERE employee_id = ANY($1)`);
    await run(`DELETE FROM portal_users WHERE developer_id = ANY($1) AND role = 'developer'`);
    await run(`UPDATE portal_users SET developer_id = NULL WHERE developer_id = ANY($1)`);
    await run(`DELETE FROM employees WHERE id = ANY($1)`);
    await client.query(
      `INSERT INTO audit_log (organization_id, action, detail, created_at)
       SELECT id, 'data.demo_people_removed', $1::jsonb, NOW() FROM organizations`,
      [JSON.stringify({ people: people.length, rows: counts })],
    );
    await client.query("COMMIT");
    console.log(`\nRemoved ${people.length} demo people and their data.`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => client.end());
