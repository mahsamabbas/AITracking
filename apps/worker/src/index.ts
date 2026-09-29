import { Queue, Worker } from "bullmq";
import {
  ensureProviderPullDevice,
  finalizeHourForDeveloper,
  ingestBatch,
  listHourlyTargets,
  runDataMaintenance,
  resolvePullOrganization,
  resolveProviderEmployee,
} from "@techlio/server-core";
import {
  copilotRowToEvent,
  cursorRowToEvent,
  downloadCopilotUsersReport,
  fetchCopilotUsersReportUrl,
  fetchCursorDailyUsage,
  parseCopilotUserDayReport,
} from "@techlio/puller";
import type { ActivityEvent } from "@techlio/event-schema";

function redisConnection(): { host: string; port: number; password?: string; tls?: object } {
  const url = process.env.REDIS_URL;
  if (url) {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: Number(parsed.port || 6379),
      password: parsed.password || undefined,
      ...(parsed.protocol === "rediss:" ? { tls: {} } : {}),
    };
  }
  return {
    host: process.env.REDIS_HOST ?? "localhost",
    port: Number(process.env.REDIS_PORT ?? 6379),
  };
}

const connection = redisConnection();

const CURSOR_API_KEY = process.env.CURSOR_API_KEY;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? process.env.GITHUB_COPILOT_TOKEN;
const GITHUB_ORG = process.env.GITHUB_ORG;
const PULL_VERSION = "puller-0.2.0";
const CONSENT_VERSION = process.env.TECHLIO_CONSENT_VERSION ?? "1";

const hourlyQueue = new Queue("hourly-finalize", { connection });

function scheduleNextHourly() {
  const now = new Date();
  const next = new Date(now);
  next.setUTCMinutes(5, 0, 0);
  if (next <= now) next.setUTCHours(next.getUTCHours() + 1);
  const delay = next.getTime() - now.getTime();
  setTimeout(async () => {
    const hour = new Date();
    hour.setUTCHours(hour.getUTCHours() - 1, 0, 0, 0);
    await hourlyQueue.add("finalize", { hour: hour.toISOString() });
    scheduleNextHourly();
  }, delay);
}

new Worker(
  "hourly-finalize",
  async (job) => {
    const hour = new Date(job.data.hour as string);
    const targets = await listHourlyTargets();
    const ids = await Promise.all(
      targets.map(({ organizationId, developerId }) =>
        finalizeHourForDeveloper(organizationId, developerId, hour, 1),
      ),
    );
    console.log("Finalized hour", hour.toISOString(), {
      developers: targets.length,
      snapshots: ids.length,
    });
  },
  { connection },
);

new Worker(
  "hourly-recalc",
  async (job) => {
    const { organizationId, developerId, hour, version, reason } = job.data as {
      organizationId: string;
      developerId: string;
      hour: string;
      version: number;
      reason: string;
    };
    const id = await finalizeHourForDeveloper(
      organizationId,
      developerId,
      new Date(hour),
      version,
      reason,
    );
    console.log("Recalculated hour", hour, "v", version, id);
  },
  { connection },
);

/** Same job as the API's nightly cron (summarise → archive → purge); safe to run from both. */
async function runRetention(): Promise<void> {
  try {
    const report = await runDataMaintenance({ budgetMs: 10 * 60_000 });
    console.log("Data maintenance", { complete: report.complete, errors: report.errors });
  } catch (err) {
    console.warn("Data maintenance skipped", err);
  }
}

setInterval(() => void runRetention(), 24 * 60 * 60 * 1000);

/**
 * Attributes one provider row to the employee it belongs to, or skips it.
 * A row is never assigned to a default person.
 */
async function attribute(
  organizationId: string,
  provider: "cursor" | "github_copilot",
  who: { email?: string; login?: string },
  build: (ctx: {
    organizationId: string;
    developerId: string;
    deviceId: string;
    connectorVersion: string;
    consentVersion: string;
  }) => ActivityEvent,
): Promise<ActivityEvent | null> {
  const employeeId = await resolveProviderEmployee({
    organizationId,
    provider,
    email: who.email,
    login: who.login,
  });
  if (!employeeId) return null;
  const deviceId = await ensureProviderPullDevice({
    organizationId,
    employeeId,
    provider,
    label: provider === "cursor" ? "Cursor Admin API (daily)" : "GitHub Copilot report (daily)",
  });
  return build({
    organizationId,
    developerId: employeeId,
    deviceId,
    connectorVersion: PULL_VERSION,
    consentVersion: CONSENT_VERSION,
  });
}

async function ingestPerDevice(organizationId: string, events: ActivityEvent[]) {
  // ingestBatch verifies each event's device, so batch per device.
  const byDevice = new Map<string, ActivityEvent[]>();
  for (const e of events) {
    const list = byDevice.get(e.device_id) ?? [];
    list.push(e);
    byDevice.set(e.device_id, list);
  }
  let accepted = 0;
  let rejected = 0;
  for (const [deviceId, list] of byDevice) {
    for (let i = 0; i < list.length; i += 500) {
      const r = await ingestBatch(organizationId, { events: list.slice(i, i + 500) }, deviceId);
      accepted += r.accepted;
      rejected += r.rejected;
    }
  }
  return { accepted, rejected };
}

async function pullCursorTierB(organizationId: string): Promise<void> {
  if (!CURSOR_API_KEY) {
    console.log("Cursor Tier B puller idle — CURSOR_API_KEY not set");
    return;
  }
  const end = Date.now();
  const start = end - 2 * 24 * 60 * 60 * 1000;
  let rows;
  try {
    rows = await fetchCursorDailyUsage(CURSOR_API_KEY, start, end);
  } catch (err) {
    console.warn("Cursor daily-usage-data pull failed", err);
    return;
  }
  const events: ActivityEvent[] = [];
  let unmapped = 0;
  for (const row of rows) {
    const event = await attribute(organizationId, "cursor", { email: row.email }, (ctx) =>
      cursorRowToEvent(row, ctx),
    );
    if (event) events.push(event);
    else unmapped++;
  }
  const result = events.length ? await ingestPerDevice(organizationId, events) : { accepted: 0, rejected: 0 };
  // Counts only — provider emails are not written to logs.
  console.log("Cursor Tier B pull", { rows: rows.length, attributed: events.length, unmapped, ...result });
}

async function pullCopilotTierB(organizationId: string): Promise<void> {
  if (!GITHUB_TOKEN || !GITHUB_ORG) {
    console.log("Copilot Tier B puller idle — GITHUB_TOKEN and GITHUB_ORG not set");
    return;
  }
  const day = new Date();
  day.setUTCDate(day.getUTCDate() - 1);
  const dayStr = day.toISOString().slice(0, 10);
  try {
    const url = await fetchCopilotUsersReportUrl(GITHUB_TOKEN, GITHUB_ORG, dayStr);
    if (!url) {
      console.warn("Copilot report URL not available for", dayStr);
      return;
    }
    const rows = parseCopilotUserDayReport(await downloadCopilotUsersReport(url));
    const events: ActivityEvent[] = [];
    let unmapped = 0;
    for (const row of rows) {
      const event = await attribute(organizationId, "github_copilot", { login: row.login }, (ctx) =>
        copilotRowToEvent(row, ctx),
      );
      if (event) events.push(event);
      else unmapped++;
    }
    const result = events.length ? await ingestPerDevice(organizationId, events) : { accepted: 0, rejected: 0 };
    console.log("Copilot Tier B pull", { rows: rows.length, attributed: events.length, unmapped, ...result });
  } catch (err) {
    console.warn("Copilot pull failed", err);
  }
}

async function pullAllTierB(): Promise<void> {
  if (!CURSOR_API_KEY && !(GITHUB_TOKEN && GITHUB_ORG)) return;
  const organizationId = await resolvePullOrganization();
  if (!organizationId) {
    console.warn(
      "Tier B pull skipped — set TECHLIO_PULL_ORG_ID; provider keys cannot be assigned to an organisation automatically when several exist.",
    );
    return;
  }
  await pullCursorTierB(organizationId);
  await pullCopilotTierB(organizationId);
}

void pullAllTierB();
setInterval(() => void pullAllTierB(), 60 * 60 * 1000);

scheduleNextHourly();
console.log(
  "Worker started (hourly finalize, recalc, retention, Cursor + Copilot Tier B)",
);
