import { createHash, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { providerLabel, type ActivityEvent } from "@techlio/event-schema";
import { db } from "./db.js";
import { devAffordancesEnabled } from "./runtime.js";
import { computeSessionMetrics } from "./sessions.js";
import { DEMO_USERS, DEV_DEVICE_ALEX, DEV_ORG } from "./users.js";
import { finalizeHourForDeveloper } from "./hourly.js";

/**
 * Generates a realistic organization's worth of agent telemetry so every
 * dashboard surface is backed by connected data rather than placeholders.
 *
 * Deterministic: the same seed always produces the same org, which keeps
 * screenshots, tests, and demos reproducible.
 */

const DAY = 86_400_000;
const MIN = 60_000;

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function uuidFrom(namespace: string, name: string): string {
  const h = createHash("sha256").update(`${namespace}:${name}`).digest("hex");
  return [
    h.slice(0, 8),
    h.slice(8, 12),
    `4${h.slice(13, 16)}`,
    ((parseInt(h.slice(16, 17), 16) & 0x3) | 0x8).toString(16) + h.slice(17, 20),
    h.slice(20, 32),
  ].join("-");
}

interface Persona {
  name: string;
  email: string;
  team: string;
  title: string;
  /** Sessions started on a typical working day. */
  intensity: number;
  /** First working hour, org timezone. */
  startHour: number;
  providers: { provider: string; weight: number }[];
  status: "active" | "inactive";
  /** Simulated connector state on the most recent day. */
  connector: "online" | "stale" | "paused" | "offline";
}

const PERSONAS: Persona[] = [
  {
    name: "Alex Rivera", email: "developer@techlio.local", team: "Platform",
    title: "Senior Engineer", intensity: 0, startHour: 9,
    providers: [{ provider: "cursor", weight: 1 }],
    status: "active", connector: "offline",
  },
  {
    name: "Sam Okafor", email: "sam@techlio.local", team: "Platform",
    title: "Engineer", intensity: 3.4, startHour: 10,
    providers: [{ provider: "claude_code", weight: 5 }, { provider: "cursor", weight: 1 }],
    status: "active", connector: "online",
  },
  {
    name: "Priya Nair", email: "priya.nair@techlio.local", team: "Platform",
    title: "Staff Engineer", intensity: 2.6, startHour: 8,
    providers: [{ provider: "cursor", weight: 4 }, { provider: "claude_code", weight: 2 }],
    status: "active", connector: "stale",
  },
  {
    name: "Daniel Weiss", email: "daniel.weiss@techlio.local", team: "Product Apps",
    title: "Engineer", intensity: 3.8, startHour: 9,
    providers: [{ provider: "cursor", weight: 5 }],
    status: "active", connector: "online",
  },
  {
    name: "Mei Tanaka", email: "mei.tanaka@techlio.local", team: "Product Apps",
    title: "Senior Engineer", intensity: 4.6, startHour: 8,
    providers: [{ provider: "claude_code", weight: 4 }, { provider: "cursor", weight: 3 }],
    status: "active", connector: "online",
  },
  {
    name: "Omar Haddad", email: "omar.haddad@techlio.local", team: "Product Apps",
    title: "Engineer", intensity: 2.1, startHour: 11,
    providers: [{ provider: "github_copilot", weight: 3 }, { provider: "cursor", weight: 2 }],
    status: "active", connector: "paused",
  },
  {
    name: "Lena Fischer", email: "lena.fischer@techlio.local", team: "Data",
    title: "Data Engineer", intensity: 3.1, startHour: 9,
    providers: [{ provider: "claude_code", weight: 3 }, { provider: "cursor", weight: 2 }],
    status: "active", connector: "online",
  },
  {
    name: "Tobias Lund", email: "tobias.lund@techlio.local", team: "Data",
    title: "Engineer", intensity: 1.8, startHour: 10,
    providers: [{ provider: "cursor", weight: 3 }],
    status: "active", connector: "offline",
  },
  {
    name: "Aisha Bello", email: "aisha.bello@techlio.local", team: "Infrastructure",
    title: "SRE", intensity: 2.9, startHour: 7,
    providers: [{ provider: "claude_code", weight: 4 }, { provider: "cursor", weight: 1 }],
    status: "active", connector: "online",
  },
  {
    name: "Marco Silva", email: "marco.silva@techlio.local", team: "Infrastructure",
    title: "Engineer", intensity: 3.3, startHour: 9,
    providers: [{ provider: "cursor", weight: 4 }, { provider: "claude_code", weight: 2 }],
    status: "active", connector: "online",
  },
  {
    name: "Hannah Cole", email: "hannah.cole@techlio.local", team: "Product Apps",
    title: "Engineer", intensity: 3.6, startHour: 10,
    providers: [{ provider: "claude_code", weight: 3 }, { provider: "vscode", weight: 2 }],
    status: "active", connector: "online",
  },
  {
    name: "Ivan Petrov", email: "ivan.petrov@techlio.local", team: "Data",
    title: "Engineer", intensity: 0, startHour: 9,
    providers: [{ provider: "cursor", weight: 1 }],
    status: "inactive", connector: "offline",
  },
];

const PROJECTS = [
  { key: "platform", name: "Techlio Platform" },
  { key: "dashboard", name: "Activity Dashboard" },
  { key: "ingest", name: "Ingestion Pipeline" },
  { key: "mobile", name: "Mobile App" },
  { key: "infra", name: "Infrastructure" },
];

const WORK_ITEMS = [
  { key: "w1", project: "platform", title: "TEC-142 · Connector registration flow" },
  { key: "w2", project: "platform", title: "TEC-158 · Org scoping on every query" },
  { key: "w3", project: "dashboard", title: "TEC-201 · Employee directory" },
  { key: "w4", project: "dashboard", title: "TEC-207 · Session drill-down" },
  { key: "w5", project: "ingest", title: "TEC-311 · Idempotent batch ingest" },
  { key: "w6", project: "ingest", title: "TEC-318 · Late event recalculation" },
  { key: "w7", project: "mobile", title: "TEC-402 · Offline queue" },
  { key: "w8", project: "infra", title: "TEC-505 · Postgres failover drill" },
];

const MODELS: Record<string, string[]> = {
  claude_code: ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5"],
  cursor: ["cursor-composer", "claude-sonnet-5", "gpt-5-codex"],
  github_copilot: ["copilot-gpt-5"],
  vscode: [],
};

const TOOL_CATEGORIES = [
  "file_read", "file_write", "search", "shell", "test", "build", "browser",
] as const;

const PATH_CATEGORIES = [
  "src/api", "src/web", "src/packages", "infra", "tests", "docs",
];

type Row = Record<string, unknown>;

export interface SeedResult {
  employees: number;
  devices: number;
  sessions: number;
  events: number;
  snapshots: number;
}

/**
 * Demo data is local-only. It refuses to run without dev mode, or against any
 * database that is not on this machine — it deletes and rewrites the org.
 */
export function assertSeedTargetIsLocal(): void {
  if (!devAffordancesEnabled()) {
    throw new Error("Refusing to seed: demo data requires TECHLIO_DEV_MODE=1 on a non-hosted runtime.");
  }
  const url = process.env.DATABASE_URL ?? "postgres://techlio:techlio@localhost:5432/techlio_activity";
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error("Refusing to seed: DATABASE_URL is not a valid URL.");
  }
  const local = ["localhost", "127.0.0.1", "::1", "postgres", "host.docker.internal"];
  if (!local.includes(host)) {
    throw new Error(
      `Refusing to seed remote database host "${host}". Demo data must never reach a shared or production database.`,
    );
  }
}

export async function seedDemoOrganization(options?: {
  days?: number;
  seed?: number;
}): Promise<SeedResult> {
  assertSeedTargetIsLocal();
  const days = options?.days ?? 45;
  const rnd = mulberry32(options?.seed ?? 20260919);
  const orgId = DEV_ORG;
  const now = new Date();
  const todayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );

  // --- reset generated data (identity + audit history are preserved) --------
  await db.execute(sql`DELETE FROM session_context_versions WHERE organization_id = ${orgId}`);
  await db.execute(sql`DELETE FROM hourly_snapshots WHERE organization_id = ${orgId}`);
  await db.execute(sql`DELETE FROM activity_events WHERE organization_id = ${orgId}`);
  await db.execute(sql`DELETE FROM agent_sessions WHERE organization_id = ${orgId}`);
  await db.execute(sql`DELETE FROM connector_health WHERE organization_id = ${orgId}`);
  await db.execute(sql`DELETE FROM devices WHERE organization_id = ${orgId}`);
  await db.execute(sql`DELETE FROM work_items WHERE organization_id = ${orgId}`);
  await db.execute(sql`DELETE FROM projects WHERE organization_id = ${orgId}`);
  await db.execute(sql`DELETE FROM employees WHERE organization_id = ${orgId}`);

  await db.execute(sql`
    INSERT INTO organizations (id, name, timezone, ai_plan_limits)
    VALUES (
      ${orgId},
      'Techlio',
      'UTC',
      ${JSON.stringify({
        cursor: { monthlyRequestBudget: 500 },
      })}::jsonb
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      ai_plan_limits = COALESCE(organizations.ai_plan_limits, EXCLUDED.ai_plan_limits)
  `);

  // --- projects & work items ------------------------------------------------
  const projectIds = new Map<string, string>();
  for (const p of PROJECTS) {
    const id = uuidFrom("project", p.key);
    projectIds.set(p.key, id);
    await db.execute(sql`
      INSERT INTO projects (id, organization_id, name, external_ref)
      VALUES (${id}, ${orgId}, ${p.name}, ${p.key})
    `);
  }
  const workItems: { id: string; projectId: string; title: string }[] = [];
  for (const w of WORK_ITEMS) {
    const id = uuidFrom("work_item", w.key);
    const projectId = projectIds.get(w.project)!;
    workItems.push({ id, projectId, title: w.title });
    await db.execute(sql`
      INSERT INTO work_items (id, organization_id, project_id, title, external_ref)
      VALUES (${id}, ${orgId}, ${projectId}, ${w.title}, ${w.key})
    `);
  }

  // --- employees, devices, connector health --------------------------------
  const demoByEmail = new Map(DEMO_USERS.map((u) => [u.email, u]));
  interface Emp extends Persona {
    id: string;
    devices: { id: string; provider: string }[];
  }
  const employees: Emp[] = [];

  for (const p of PERSONAS) {
    const existing = demoByEmail.get(p.email);
    const id = existing?.developerId ?? uuidFrom("employee", p.email);
    await db.execute(sql`
      INSERT INTO employees (id, organization_id, display_name, email, team, title, status, joined_at, created_at)
      VALUES (${id}, ${orgId}, ${p.name}, ${p.email}, ${p.team}, ${p.title}, ${p.status},
              ${new Date(todayStart.getTime() - (200 + Math.floor(rnd() * 600)) * DAY)}, ${new Date()})
    `);

    const devices: { id: string; provider: string }[] = [];
    const isLiveEmployee = p.email === "developer@techlio.local";
    for (const prov of p.providers) {
      const deviceId =
        isLiveEmployee && prov.provider === "cursor"
          ? DEV_DEVICE_ALEX
          : uuidFrom("device", `${p.email}:${prov.provider}`);
      devices.push({ id: deviceId, provider: prov.provider });
      const tokenHash =
        deviceId === DEV_DEVICE_ALEX
          ? createHash("sha256").update("dev-device-token").digest("hex")
          : createHash("sha256").update(`seed-token:${deviceId}`).digest("hex");
      await db.execute(sql`
        INSERT INTO devices (id, organization_id, developer_id, token_hash, provider, label, created_at)
        VALUES (${deviceId}, ${orgId}, ${id},
                ${tokenHash},
                ${prov.provider}, ${`${p.name.split(" ")[0]}'s ${providerLabel(prov.provider)}`},
                ${new Date(todayStart.getTime() - 60 * DAY)})
      `);

      const isPrimary = devices.length === 1;
      let lastHeartbeat: Date | null = new Date(now.getTime() - 40_000);
      let paused = 0;
      if (isPrimary) {
        if (p.connector === "stale") lastHeartbeat = new Date(now.getTime() - 42 * MIN);
        if (p.connector === "offline") lastHeartbeat = null;
        if (p.connector === "paused") paused = 1;
      }
      // Seeded heartbeats are a snapshot at seed time. They go stale honestly
      // afterwards — nothing re-anchors them. The live developer's rows start
      // empty so only the real local connector can mark them online.
      if (isLiveEmployee) lastHeartbeat = null;
      await db.execute(sql`
        INSERT INTO connector_health (device_id, organization_id, last_heartbeat, version, queue_depth, paused, provider)
        VALUES (${deviceId}, ${orgId}, ${lastHeartbeat}, '0.4.2',
                ${paused === 1 ? 14 : Math.floor(rnd() * 3)}, ${paused}, ${prov.provider})
      `);
    }
    employees.push({ ...p, id, devices });
  }

  // --- keep portal sign-ins pointing at real employees ----------------------
  for (const [email, demo] of demoByEmail) {
    const emp = employees.find((e) => e.email === email);
    if (emp && demo.role === "developer") {
      await db.execute(sql`
        UPDATE portal_users SET developer_id = ${emp.id}, display_name = ${emp.name}
        WHERE email = ${email}
      `);
    }
  }

  // --- telemetry ------------------------------------------------------------
  const events: ActivityEvent[] = [];
  const sessions: Row[] = [];
  const contextVersions: Row[] = [];

  const push = (e: Partial<ActivityEvent> & { event_type: string }, base: ActivityEvent) => {
    events.push({ ...base, ...e, event_id: randomUUID() } as ActivityEvent);
  };

  for (const emp of employees) {
    if (emp.email === "developer@techlio.local") continue;
    if (emp.intensity === 0) continue;
    const weightTotal = emp.providers.reduce((s, p) => s + p.weight, 0);

    for (let d = days - 1; d >= 0; d--) {
      const dayStart = new Date(todayStart.getTime() - d * DAY);
      const dow = dayStart.getUTCDay();
      if (dow === 0 || dow === 6) {
        if (rnd() > 0.12) continue; // occasional weekend work
      }
      // A few genuine days off / PTO.
      if (rnd() < 0.06) continue;

      const sessionCount = Math.max(
        1,
        Math.round(emp.intensity * (0.55 + rnd() * 0.9)),
      );
      let cursorMs = dayStart.getTime() + emp.startHour * 3600_000 + rnd() * 40 * MIN;

      for (let s = 0; s < sessionCount; s++) {
        if (cursorMs > now.getTime()) break; // never generate future telemetry
        // pick provider by weight
        let pick = rnd() * weightTotal;
        let provider = emp.providers[0].provider;
        for (const p of emp.providers) {
          pick -= p.weight;
          if (pick <= 0) { provider = p.provider; break; }
        }
        const device =
          emp.devices.find((dv) => dv.provider === provider) ?? emp.devices[0];

        const sessionId = randomUUID();
        const assigned = rnd() > 0.14;
        const workItem = workItems[Math.floor(rnd() * workItems.length)];
        const projectId = assigned ? workItem.projectId : null;
        const workItemId = assigned ? workItem.id : null;

        const base: ActivityEvent = {
          event_id: randomUUID(),
          schema_version: "1.0.0",
          organization_id: orgId,
          developer_id: emp.id,
          device_id: device.id,
          provider,
          connector_version: "0.4.2",
          session_id: sessionId,
          event_type: "session_started",
          occurred_at: new Date(cursorMs).toISOString(),
          consent_version: "2026-09-01",
          ...(projectId ? { project_id: projectId } : {}),
          ...(workItemId ? { work_item_id: workItemId } : {}),
        };

        const sessionStart = cursorMs;
        push({ event_type: "session_started", occurred_at: new Date(cursorMs).toISOString() }, base);

        const turns = 5 + Math.floor(rnd() * 17);
        const tierB = provider === "github_copilot" || provider === "vscode";
        let hasLongIdle = false;

        for (let t = 0; t < turns; t++) {
          cursorMs += (8 + rnd() * 70) * 1000;

          // Occasional real idle gap inside a session (FR-018).
          if (rnd() < 0.03) {
            cursorMs += (11 + rnd() * 22) * MIN;
            hasLongIdle = true;
          }

          if (!tierB) {
            const modelMs = Math.round((4 + rnd() * 42) * 1000);
            const model = MODELS[provider][Math.floor(rnd() * MODELS[provider].length)];
            push({
              event_type: "model_request_started",
              occurred_at: new Date(cursorMs).toISOString(),
              status: "started",
              metadata: { model_name: model, provider_name: provider },
            }, base);
            cursorMs += modelMs;
            push({
              event_type: "model_request_completed",
              occurred_at: new Date(cursorMs).toISOString(),
              duration_ms: modelMs,
              status: rnd() < 0.03 ? "failed" : "succeeded",
              metadata: {
                model_name: model,
                provider_name: provider,
              },
            }, base);
          }

          const toolRuns = 1 + Math.floor(rnd() * 4);
          for (let k = 0; k < toolRuns; k++) {
            const cat = TOOL_CATEGORIES[Math.floor(rnd() * TOOL_CATEGORIES.length)];
            if (tierB && cat !== "file_write" && cat !== "file_read") continue;
            const toolMs = Math.round((0.6 + rnd() * 14) * 1000);
            cursorMs += 1500 + rnd() * 4000;
            push({
              event_type: "tool_started",
              occurred_at: new Date(cursorMs).toISOString(),
              status: "started",
              metadata: { tool_category: cat, tool_name: cat },
            }, base);
            cursorMs += toolMs;
            push({
              event_type: "tool_completed",
              occurred_at: new Date(cursorMs).toISOString(),
              duration_ms: toolMs,
              status: rnd() < 0.05 ? "failed" : "succeeded",
              metadata: { tool_category: cat, tool_name: cat },
            }, base);

            if (cat === "file_write") {
              push({
                event_type: rnd() < 0.18 ? "file_created" : "file_modified",
                occurred_at: new Date(cursorMs + 400).toISOString(),
                metadata: {
                  path_category: PATH_CATEGORIES[Math.floor(rnd() * PATH_CATEGORIES.length)],
                },
              }, base);
            }
          }

          // Engineering checks (FR-014)
          if (!tierB && rnd() < 0.22) {
            const testMs = Math.round((4 + rnd() * 50) * 1000);
            const failed = rnd() < 0.24 ? 1 + Math.floor(rnd() * 4) : 0;
            push({ event_type: "test_started", occurred_at: new Date(cursorMs).toISOString(), status: "started" }, base);
            cursorMs += testMs;
            push({
              event_type: "test_completed",
              occurred_at: new Date(cursorMs).toISOString(),
              duration_ms: testMs,
              status: failed > 0 ? "failed" : "succeeded",
              metadata: { test_passed: 12 + Math.floor(rnd() * 140), test_failed: failed },
            }, base);
          }
          if (!tierB && rnd() < 0.12) {
            const buildMs = Math.round((10 + rnd() * 90) * 1000);
            push({ event_type: "build_started", occurred_at: new Date(cursorMs).toISOString(), status: "started" }, base);
            cursorMs += buildMs;
            push({
              event_type: "build_completed",
              occurred_at: new Date(cursorMs).toISOString(),
              duration_ms: buildMs,
              status: rnd() < 0.15 ? "failed" : "succeeded",
            }, base);
          }
        }

        // Mid-session context change (FR-011)
        if (assigned && rnd() < 0.18) {
          const next = workItems[Math.floor(rnd() * workItems.length)];
          const at = new Date(sessionStart + (cursorMs - sessionStart) * 0.5);
          push({
            event_type: "task_context_changed",
            occurred_at: at.toISOString(),
            project_id: next.projectId,
            work_item_id: next.id,
          } as Partial<ActivityEvent> & { event_type: string }, base);
          contextVersions.push({
            id: randomUUID(), sessionId, organizationId: orgId,
            projectId: next.projectId, workItemId: next.id,
            label: null, version: 1, recordedAt: at,
          });
        }

        // Coverage gap: paused collection mid-session (FR-005 / FR-019)
        let coverageGap = false;
        if (rnd() < 0.04) {
          coverageGap = true;
          push({
            event_type: "telemetry_gap_started",
            occurred_at: new Date(cursorMs).toISOString(),
            metadata: { gap_reason: "paused", connector_paused: true },
          }, base);
          cursorMs += (15 + rnd() * 50) * MIN;
          push({
            event_type: "telemetry_gap_ended",
            occurred_at: new Date(cursorMs).toISOString(),
            metadata: { connector_paused: false },
          }, base);
        }

        if (tierB) {
          push({
            event_type: "provider_capability_missing",
            occurred_at: new Date(cursorMs).toISOString(),
            metadata: { capabilities_missing: "model_request,tool_calls" },
          }, base);
        }

        cursorMs += (1 + rnd() * 4) * MIN;
        push({ event_type: "session_ended", occurred_at: new Date(cursorMs).toISOString() }, base);

        sessions.push({
          id: sessionId,
          organizationId: orgId,
          developerId: emp.id,
          deviceId: device.id,
          provider,
          startedAt: new Date(sessionStart),
          endedAt: new Date(cursorMs),
          projectId,
          workItemId,
          unassigned: !assigned,
          _hasLongIdle: hasLongIdle,
          _coverageGap: coverageGap,
        });

        cursorMs += (10 + rnd() * 90) * MIN; // gap before the next session
        if (cursorMs > dayStart.getTime() + 21 * 3600_000) break;
      }

      // Connector heartbeats through the working day.
      const primary = emp.devices[0];
      for (let h = emp.startHour; h < emp.startHour + 9; h++) {
        const at = new Date(dayStart.getTime() + h * 3600_000 + rnd() * 30 * MIN);
        if (at.getTime() > now.getTime()) break;
        events.push({
          event_id: randomUUID(),
          schema_version: "1.0.0",
          organization_id: orgId,
          developer_id: emp.id,
          device_id: primary.id,
          provider: primary.provider,
          connector_version: "0.4.2",
          event_type: "heartbeat_sent",
          occurred_at: at.toISOString(),
          consent_version: "2026-09-01",
          metadata: { queue_depth: Math.floor(rnd() * 3) },
        } as ActivityEvent);
      }
    }
  }

  // --- persist --------------------------------------------------------------
  await bulkInsertSessions(sessions);
  await bulkInsertEvents(events);
  await bulkInsertContextVersions(contextVersions);

  // --- compute session metrics from the events we just wrote ---------------
  const eventsBySession = new Map<string, ActivityEvent[]>();
  for (const e of events) {
    if (!e.session_id) continue;
    const list = eventsBySession.get(e.session_id) ?? [];
    list.push(e);
    eventsBySession.set(e.session_id, list);
  }

  const updates: Row[] = [];
  for (const [sessionId, list] of eventsBySession) {
    list.sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
    const m = computeSessionMetrics(list);
    updates.push({ sessionId, ...m });
  }
  await bulkUpdateSessionMetrics(updates);

  // --- hourly snapshots for the last 48 hours (§8.4 / FR-023) --------------
  let snapshots = 0;
  const hourCursor = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours()),
  );
  const oldestHour = hourCursor.getTime() - 48 * 3600_000;
  const populatedHours = new Set<string>();
  for (const e of events) {
    if (e.event_type === "heartbeat_sent") continue;
    const t = new Date(e.occurred_at).getTime();
    if (t < oldestHour || t >= hourCursor.getTime()) continue;
    populatedHours.add(`${e.developer_id}|${Math.floor(t / 3600_000) * 3600_000}`);
  }
  for (const key of populatedHours) {
    const [developerId, hourMs] = key.split("|");
    await finalizeHourForDeveloper(orgId, developerId, new Date(Number(hourMs)));
    snapshots++;
  }

  await db.execute(sql`
    INSERT INTO audit_log (organization_id, action, detail, created_at)
    VALUES (${orgId}, 'demo.seed',
            ${JSON.stringify({ employees: employees.length, sessions: sessions.length, events: events.length })}::jsonb,
            NOW())
  `);

  return {
    employees: employees.length,
    devices: employees.reduce((s, e) => s + e.devices.length, 0),
    sessions: sessions.length,
    events: events.length,
    snapshots,
  };
}

// ---------------------------------------------------------------------------
// Bulk writers — chunked multi-row INSERTs keep the seed under a few seconds.
// ---------------------------------------------------------------------------

async function bulkInsertSessions(rows: Row[]): Promise<void> {
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const values = chunk.map(
      (r) => sql`(${r.id}, ${r.organizationId}, ${r.developerId}, ${r.deviceId},
                  ${r.provider}, ${r.startedAt}, ${r.endedAt}, ${r.projectId},
                  ${r.workItemId}, ${r.unassigned})`,
    );
    await db.execute(sql`
      INSERT INTO agent_sessions
        (id, organization_id, developer_id, device_id, provider, started_at, ended_at, project_id, work_item_id, unassigned)
      VALUES ${sql.join(values, sql`, `)}
      ON CONFLICT (id) DO NOTHING
    `);
  }
}

async function bulkInsertEvents(events: ActivityEvent[]): Promise<void> {
  const receivedAt = new Date();
  for (let i = 0; i < events.length; i += 400) {
    const chunk = events.slice(i, i + 400);
    const values = chunk.map(
      (e) => sql`(${e.event_id}, ${e.organization_id}, ${e.developer_id}, ${e.device_id},
                  ${e.session_id ?? null}, ${e.event_type}, ${new Date(e.occurred_at)},
                  ${receivedAt}, ${JSON.stringify(e)}::jsonb)`,
    );
    await db.execute(sql`
      INSERT INTO activity_events
        (event_id, organization_id, developer_id, device_id, session_id, event_type, occurred_at, received_at, payload)
      VALUES ${sql.join(values, sql`, `)}
      ON CONFLICT (event_id) DO NOTHING
    `);
  }
}

async function bulkInsertContextVersions(rows: Row[]): Promise<void> {
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    if (chunk.length === 0) return;
    const values = chunk.map(
      (r) => sql`(${r.id}, ${r.sessionId}, ${r.organizationId}, ${r.projectId},
                  ${r.workItemId}, ${r.label}, ${r.version}, ${r.recordedAt})`,
    );
    await db.execute(sql`
      INSERT INTO session_context_versions
        (id, session_id, organization_id, project_id, work_item_id, label, version, recorded_at)
      VALUES ${sql.join(values, sql`, `)}
    `);
  }
}

async function bulkUpdateSessionMetrics(rows: Row[]): Promise<void> {
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const values = chunk.map(
      (r) => sql`(${r.sessionId}::uuid, ${r.modelDurationMs}::bigint, ${r.toolDurationMs}::bigint,
                  ${r.activeDurationMs}::bigint, ${r.interactiveSpanMs}::bigint, ${r.elapsedSpanMs}::bigint,
                  ${r.idleDurationMs}::bigint, ${r.eventCount}::int, ${r.modelRequests}::int,
                  ${r.toolCalls}::int, ${r.testsRun}::int, ${r.testsPassed}::int, ${r.testsFailed}::int,
                  ${r.buildsRun}::int, ${r.buildsFailed}::int, ${r.fileChanges}::int, ${r.failures}::int,
                  ${r.tokenInput}::bigint, ${r.tokenOutput}::bigint,
                  ${JSON.stringify(r.modelsUsed)}::jsonb, ${JSON.stringify(r.toolCategories)}::jsonb,
                  ${r.classification}::text, ${r.coverageState}::text, ${r.lastEventAt}::timestamptz)`,
    );
    await db.execute(sql`
      UPDATE agent_sessions AS s SET
        model_duration_ms = v.model_duration_ms,
        tool_duration_ms = v.tool_duration_ms,
        active_duration_ms = v.active_duration_ms,
        interactive_span_ms = v.interactive_span_ms,
        elapsed_span_ms = v.elapsed_span_ms,
        idle_duration_ms = v.idle_duration_ms,
        event_count = v.event_count,
        model_requests = v.model_requests,
        tool_calls = v.tool_calls,
        tests_run = v.tests_run,
        tests_passed = v.tests_passed,
        tests_failed = v.tests_failed,
        builds_run = v.builds_run,
        builds_failed = v.builds_failed,
        file_changes = v.file_changes,
        failures = v.failures,
        token_input = v.token_input,
        token_output = v.token_output,
        models_used = v.models_used,
        tool_categories = v.tool_categories,
        classification = v.classification,
        coverage_state = v.coverage_state,
        last_event_at = v.last_event_at,
        metrics_at = NOW()
      FROM (VALUES ${sql.join(values, sql`, `)}) AS v(
        id, model_duration_ms, tool_duration_ms, active_duration_ms, interactive_span_ms,
        elapsed_span_ms, idle_duration_ms, event_count, model_requests, tool_calls,
        tests_run, tests_passed, tests_failed, builds_run, builds_failed, file_changes,
        failures, token_input, token_output, models_used, tool_categories,
        classification, coverage_state, last_event_at)
      WHERE s.id = v.id
    `);
  }
}
