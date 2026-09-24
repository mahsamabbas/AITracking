import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import {
  activityTypeOf,
  canViewActivityEvents,
  canViewDeveloper,
  db,
  getHourlySnapshotDetail,
  getOrgPolicy,
  hourlySnapshots,
  isDatabaseReady,
  sql,
} from "@techlio/server-core";
import { and, desc, eq, gte } from "drizzle-orm";
import { providerLabel } from "@techlio/event-schema";
import { listRecentEvents } from "./services/ingest.js";
import { DashboardAuthGuard, requireRoles, userFromRequest } from "./auth/guards.js";
import { orgAccessFromRequest } from "./auth/org-scope.js";
import { reportingTimezoneFromRequest } from "./auth/reporting-timezone.js";

const STALE_MS = 5 * 60 * 1000;

export interface LiveConnector {
  deviceId: string;
  developerId: string;
  displayName: string;
  team: string | null;
  provider: string | null;
  connectorVersion: string | null;
  lastHeartbeat: string | null;
  queueDepth: number | null;
  paused: boolean;
  state: "online" | "stale" | "paused" | "offline";
}

export interface LiveAlert {
  severity: "info" | "warning" | "error";
  code: string;
  message: string;
  developerId?: string;
  displayName?: string;
  deviceId?: string;
}

@Controller("v1")
export class DashboardController {
  /**
   * Near-live operational status (FR-020, FR-021). Deliberately small — the
   * heavy aggregates live behind /v1/analytics/* so this stays fast to poll.
   */
  @Get("dashboard/live")
  @UseGuards(DashboardAuthGuard)
  async live(@Req() req: FastifyRequest, @Query("limit") limit?: string) {
    const { organizationId, actor: user } = await orgAccessFromRequest(req);
    requireRoles(user, ["administrator", "manager", "developer", "auditor"]);

    if (!(await isDatabaseReady())) {
      return {
        dbAvailable: false,
        hint: "Run: docker compose up -d postgres redis && pnpm db:migrate && pnpm db:seed",
        connectors: [],
        activeSessions: [],
        alerts: [],
        recentEvents: [],
        viewer: viewerOf(user),
      };
    }

    const selfOnly = user.role === "developer" ? user.developerId ?? "" : null;

    const connectorRes = await db.execute<{
      device_id: string;
      developer_id: string;
      display_name: string;
      team: string | null;
      provider: string | null;
      version: string | null;
      last_heartbeat: Date | null;
      queue_depth: number | null;
      paused: number | null;
    }>(sql`
      SELECT d.id AS device_id, d.developer_id, e.display_name, e.team,
             COALESCE(ch.provider, d.provider) AS provider,
             ch.version, ch.last_heartbeat, ch.queue_depth, ch.paused
      FROM devices d
      JOIN employees e ON e.id = d.developer_id
      LEFT JOIN connector_health ch ON ch.device_id = d.id
      WHERE d.organization_id = ${organizationId} AND d.revoked_at IS NULL AND d.kind = 'connector'
        ${selfOnly !== null ? sql`AND d.developer_id = ${selfOnly}` : sql``}
      ORDER BY e.display_name ASC
    `);

    const connectors: LiveConnector[] = connectorRes.rows.map((r) => {
      const paused = r.paused === 1;
      const last = r.last_heartbeat ? new Date(r.last_heartbeat) : null;
      const state: LiveConnector["state"] = paused
        ? "paused"
        : !last
          ? "offline"
          : Date.now() - last.getTime() > STALE_MS
            ? "stale"
            : "online";
      return {
        deviceId: r.device_id,
        developerId: r.developer_id,
        displayName: r.display_name,
        team: r.team,
        provider: r.provider,
        connectorVersion: r.version,
        lastHeartbeat: last ? last.toISOString() : null,
        queueDepth: r.queue_depth,
        paused,
        state,
      };
    });

    // Auditors see connector health and policy, never individual activity.
    const sessionRes = !canViewActivityEvents(user)
      ? { rows: [] }
      : await db.execute<{
      id: string;
      developer_id: string;
      display_name: string;
      provider: string;
      started_at: Date;
      last_event_at: Date | null;
      project_name: string | null;
      unassigned: boolean;
      active_duration_ms: string;
      event_count: number;
    }>(sql`
      SELECT s.id, s.developer_id, e.display_name, s.provider, s.started_at,
             s.last_event_at, p.name AS project_name, s.unassigned,
             s.active_duration_ms, s.event_count
      FROM agent_sessions s
      JOIN employees e ON e.id = s.developer_id
      LEFT JOIN projects p ON p.id = s.project_id
      WHERE s.organization_id = ${organizationId}
        AND COALESCE(s.last_event_at, s.started_at) > NOW() - INTERVAL '24 hours'
        ${selfOnly !== null ? sql`AND s.developer_id = ${selfOnly}` : sql``}
      ORDER BY COALESCE(s.last_event_at, s.started_at) DESC
      LIMIT 12
    `);

    const activeSessions = sessionRes.rows.map((r) => ({
      sessionId: r.id,
      developerId: r.developer_id,
      displayName: r.display_name,
      provider: r.provider,
      startedAt: new Date(r.started_at).toISOString(),
      lastEventAt: r.last_event_at ? new Date(r.last_event_at).toISOString() : null,
      project: r.project_name,
      unassigned: r.unassigned,
      activeMs: Number(r.active_duration_ms ?? 0),
      eventCount: r.event_count,
    }));

    // Per-person live strip (FR-020/021): what each agent is doing right now.
    // Only allowlisted metadata (model name, tool name) — never content.
    const peopleRes = canViewActivityEvents(user)
      ? await db.execute<{
          developer_id: string;
          display_name: string;
          provider: string | null;
          last_at: Date | null;
          last_model: string | null;
          last_tool: string | null;
          hour_events: number;
        }>(sql`
          WITH recent AS (
            SELECT e.developer_id, e.occurred_at, e.payload
            FROM activity_events e
            WHERE e.organization_id = ${organizationId}
              AND e.occurred_at > NOW() - INTERVAL '2 hours'
              AND e.event_type NOT IN ('heartbeat_sent')
              ${selfOnly !== null ? sql`AND e.developer_id = ${selfOnly}` : sql``}
          )
          SELECT r.developer_id, emp.display_name,
                 (SELECT x.payload->>'provider' FROM recent x WHERE x.developer_id = r.developer_id
                   AND x.payload->>'event_type' LIKE ANY (ARRAY['model_%','tool_%','file_%','session_%'])
                   ORDER BY x.occurred_at DESC LIMIT 1) AS provider,
                 MAX(r.occurred_at) AS last_at,
                 (SELECT x.payload->'metadata'->>'model_name' FROM recent x WHERE x.developer_id = r.developer_id
                   AND x.payload->'metadata'->>'model_name' IS NOT NULL ORDER BY x.occurred_at DESC LIMIT 1) AS last_model,
                 (SELECT x.payload->'metadata'->>'tool_name' FROM recent x WHERE x.developer_id = r.developer_id
                   AND x.payload->>'event_type' LIKE 'tool_%' ORDER BY x.occurred_at DESC LIMIT 1) AS last_tool,
                 COUNT(*) FILTER (WHERE r.occurred_at >= date_trunc('hour', NOW()))::int AS hour_events
          FROM recent r
          JOIN employees emp ON emp.id = r.developer_id
          GROUP BY r.developer_id, emp.display_name
          ORDER BY last_at DESC
        `)
      : { rows: [] };
    const people = peopleRes.rows.map((p) => {
      const last = p.last_at ? new Date(p.last_at) : null;
      const ageMs = last ? Date.now() - last.getTime() : Infinity;
      return {
        developerId: p.developer_id,
        displayName: p.display_name,
        provider: p.provider,
        // "active" = agent event in the last 10 minutes (the idle threshold).
        sessionState: ageMs < 10 * 60_000 ? ("active" as const) : ("recent" as const),
        lastEventAt: last ? last.toISOString() : null,
        lastModel: p.last_model,
        lastTool: p.last_tool,
        eventsThisHour: p.hour_events,
      };
    });

    const recentEvents = canViewActivityEvents(user)
      ? (
          await listRecentEvents(organizationId, Math.min(Number(limit ?? 25) || 25, 100), {
            developerId: selfOnly ?? undefined,
          })
        ).map((e) => ({ ...e, activity_type: activityTypeOf(e.event_type) }))
      : [];

    // One notice per employee per condition — several devices for the same
    // person are named in a single line instead of repeating the warning.
    const grouped = new Map<string, { state: string; developerId: string; displayName: string; tools: string[] }>();
    for (const c of connectors) {
      if (c.state === "online") continue;
      const key = `${c.developerId}|${c.state}`;
      const entry = grouped.get(key) ?? {
        state: c.state,
        developerId: c.developerId,
        displayName: c.displayName,
        tools: [],
      };
      entry.tools.push(providerLabel(c.provider ?? undefined));
      grouped.set(key, entry);
    }

    const alerts: LiveAlert[] = [...grouped.values()].map((g) => {
      const tools = g.tools.join(", ");
      if (g.state === "offline") {
        return {
          severity: "warning" as const,
          code: "connector_offline",
          message: `${g.displayName} has no telemetry from ${tools} — the connector has never reported a heartbeat. Missing telemetry is not inactivity.`,
          developerId: g.developerId,
          displayName: g.displayName,
        };
      }
      if (g.state === "paused") {
        return {
          severity: "info" as const,
          code: "collection_paused",
          message: `${g.displayName} paused collection on ${tools}. A coverage gap is recorded; this is not a conclusion about their work.`,
          developerId: g.developerId,
          displayName: g.displayName,
        };
      }
      return {
        severity: "warning" as const,
        code: "stale_connector",
        message: `${g.displayName}'s ${tools} connector stopped sending heartbeats — activity for this period may be incomplete.`,
        developerId: g.developerId,
        displayName: g.displayName,
      };
    });
    for (const s of activeSessions.filter((s) => s.unassigned).slice(0, 3)) {
      alerts.push({
        severity: "info",
        code: "unassigned_activity",
        message: `${s.displayName} has a recent session with no project or work item selected.`,
        developerId: s.developerId,
        displayName: s.displayName,
      });
    }

    const signalRes = await db.execute<{
      event_type: string;
      developer_id: string;
      display_name: string;
      n: number;
    }>(sql`
      SELECT ae.event_type, ae.developer_id, e.display_name, COUNT(*)::int AS n
      FROM activity_events ae
      JOIN employees e ON e.id = ae.developer_id
      WHERE ae.organization_id = ${organizationId}
        AND ae.occurred_at >= NOW() - INTERVAL '24 hours'
        AND ae.event_type IN ('upload_failed', 'upload_recovered', 'update_required')
        ${selfOnly !== null ? sql`AND ae.developer_id = ${selfOnly}` : sql``}
      GROUP BY ae.event_type, ae.developer_id, e.display_name
      ORDER BY n DESC
      LIMIT 12
    `);
    for (const row of signalRes.rows) {
      if (row.event_type === "upload_failed" && row.n < 2) continue;
      const label =
        row.event_type === "upload_recovered"
          ? "upload recovered"
          : row.event_type === "update_required"
            ? "connector update required"
            : "repeated upload failures";
      alerts.push({
        severity: row.event_type === "upload_recovered" ? "info" : "warning",
        code: row.event_type,
        message: `${row.display_name}: ${label} (${row.n} in the last 24 hours).`,
        developerId: row.developer_id,
        displayName: row.display_name,
      });
    }

    return {
      dbAvailable: true,
      connectors,
      activeSessions,
      people,
      alerts,
      recentEvents,
      policy: await getOrgPolicy(organizationId),
      viewer: viewerOf(user),
      generatedAt: new Date().toISOString(),
    };
  }

  /** FR-022 — hourly cards for one developer. */
  @Get("developers/:id/timeline")
  @UseGuards(DashboardAuthGuard)
  async timeline(
    @Param("id") developerId: string,
    @Req() req: FastifyRequest,
    @Query("hours") hours?: string,
  ) {
    const { organizationId, actor: user } = await orgAccessFromRequest(req);
    if (!canViewDeveloper(user, developerId)) {
      throw new ForbiddenException("out_of_scope");
    }
    const lookback = Math.min(Number(hours ?? 48) || 48, 24 * 14);
    const since = new Date(Date.now() - lookback * 3600_000);
    const snapshots = await db
      .select()
      .from(hourlySnapshots)
      .where(
        and(
          eq(hourlySnapshots.developerId, developerId),
          eq(hourlySnapshots.organizationId, organizationId),
          gte(hourlySnapshots.hourStart, since),
        ),
      )
      .orderBy(desc(hourlySnapshots.hourStart));
    const tz = await reportingTimezoneFromRequest(req, organizationId);
    const hourFmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    const latest = new Map<string, (typeof snapshots)[number]>();
    for (const snap of snapshots) {
      const key = new Date(snap.hourStart).toISOString();
      const prev = latest.get(key);
      if (!prev || snap.version > prev.version) latest.set(key, snap);
    }
    const hourlyCards = [...latest.values()]
      .sort((a, b) => new Date(b.hourStart).getTime() - new Date(a.hourStart).getTime())
      .map((snap) => ({
        ...snap,
        hourLabel: hourFmt.format(new Date(snap.hourStart)),
      }));
    return { timezone: tz, hourlyCards };
  }

  /** FR-025 — drill from an hourly summary to its source events. */
  @Get("hourly-snapshots/:id")
  @UseGuards(DashboardAuthGuard)
  async hourlySnapshot(@Param("id") id: string, @Req() req: FastifyRequest) {
    const { organizationId, actor: user } = await orgAccessFromRequest(req);
    const detail = await getHourlySnapshotDetail(organizationId, id);
    if (!detail.snapshot) throw new NotFoundException("snapshot_not_found");
    if (!canViewDeveloper(user, detail.snapshot.developerId)) {
      throw new ForbiddenException("out_of_scope");
    }
    return detail;
  }
}

function viewerOf(user: ReturnType<typeof userFromRequest>) {
  return {
    id: user.id,
    displayName: user.displayName,
    role: user.role,
    email: user.email,
    developerId: user.developerId ?? null,
  };
}
