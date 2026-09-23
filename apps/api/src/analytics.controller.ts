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
  activityTotals,
  canViewDeveloper,
  canViewTeam,
  classificationSplit,
  coverageSummary,
  dailyTrend,
  db,
  employeeDevices,
  getEmployee,
  getSessionDetail,
  hourOfDayPattern,
  idlePeriods,
  listEmployeeDirectory,
  listSessions,
  listTeams,
  modelBreakdown,
  organizationAnalytics,
  previousRange,
  projectBreakdown,
  projects,
  resolveRange,
  toolCategoryBreakdown,
  toolDistribution,
  workItems,
  weekdayPattern,
  workspaceFileChanges,
  fileChangeTrend,
  employeeAiSubscriptions,
  type AuthUser,
  type DateRange,
} from "@techlio/server-core";
import { PROVIDER_CAPABILITIES } from "@techlio/event-schema";
import { eq } from "drizzle-orm";
import { DashboardAuthGuard, requireRoles, userFromRequest } from "./auth/guards.js";

interface RangeQuery {
  preset?: string;
  from?: string;
  to?: string;
}

function rangeFrom(q: RangeQuery): { range: DateRange; preset: string } {
  return resolveRange({ preset: q.preset, from: q.from, to: q.to });
}

/** Developers may only ever resolve to their own record (FR-002, FR-004). */
function scopeDeveloperIds(user: AuthUser): string[] | undefined {
  if (user.role === "developer") {
    return user.developerId ? [user.developerId] : [];
  }
  return undefined;
}

function assertCanViewPeople(user: AuthUser): void {
  if (user.role === "auditor") {
    throw new ForbiddenException("auditor_cannot_view_individual_activity");
  }
}

/** Optional analytics — must not break the employee page if a query or migration lags. */
async function safeAnalytics<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.error(`[analytics] ${label}`, err);
    return fallback;
  }
}

@Controller("v1")
@UseGuards(DashboardAuthGuard)
export class AnalyticsController {
  // -------------------------------------------------------------------------
  // Organization overview
  // -------------------------------------------------------------------------
  @Get("analytics/organization")
  async organization(
    @Req() req: FastifyRequest,
    @Query() q: RangeQuery & { team?: string; provider?: string },
  ) {
    const user = userFromRequest(req);
    requireRoles(user, ["administrator", "manager", "developer"]);
    const { range, preset } = rangeFrom(q);
    const data = await organizationAnalytics({
      organizationId: user.organizationId,
      range,
      team: q.team || undefined,
      provider: q.provider || undefined,
      developerIds: scopeDeveloperIds(user),
    });
    return { ...data, preset, scope: user.role === "developer" ? "self" : "organization" };
  }

  // -------------------------------------------------------------------------
  // Filter vocabulary shared by every screen
  // -------------------------------------------------------------------------
  @Get("meta/filters")
  async filters(@Req() req: FastifyRequest) {
    const user = userFromRequest(req);
    const [teams, projectRows, workItemRows] = await Promise.all([
      listTeams(user.organizationId),
      db
        .select({ id: projects.id, name: projects.name })
        .from(projects)
        .where(eq(projects.organizationId, user.organizationId)),
      db
        .select({ id: workItems.id, title: workItems.title, projectId: workItems.projectId })
        .from(workItems)
        .where(eq(workItems.organizationId, user.organizationId)),
    ]);
    return {
      teams,
      projects: projectRows,
      workItems: workItemRows,
      timezone: process.env.ORG_TIMEZONE ?? "UTC",
      providers: Object.values(PROVIDER_CAPABILITIES).map((p) => ({
        id: p.id,
        label: p.label,
        tier: p.tier,
        hourly: p.hourly,
        missing: p.missing,
        emptyState: p.emptyState,
      })),
    };
  }

  // -------------------------------------------------------------------------
  // Employee directory
  // -------------------------------------------------------------------------
  @Get("employees")
  async employees(
    @Req() req: FastifyRequest,
    @Query()
    q: RangeQuery & {
      search?: string;
      team?: string;
      provider?: string;
      status?: string;
      connectorState?: string;
      sort?: string;
    },
  ) {
    const user = userFromRequest(req);
    assertCanViewPeople(user);
    const { range, preset } = rangeFrom(q);
    const rows = await listEmployeeDirectory({
      organizationId: user.organizationId,
      range,
      search: q.search || undefined,
      team: q.team || undefined,
      provider: q.provider || undefined,
      status: q.status || undefined,
      connectorState: q.connectorState || undefined,
      developerIds: scopeDeveloperIds(user),
      sort: (q.sort as "name" | "activity" | "sessions" | "recent") || "activity",
    });
    return {
      employees: rows,
      // Summary is computed here from the same rows, so the browser never
      // aggregates metrics itself.
      summary: {
        listed: rows.length,
        withActivity: rows.filter((r) => r.sessions > 0).length,
        activeMs: rows.reduce((s, r) => s + r.activeMs, 0),
        sessions: rows.reduce((s, r) => s + r.sessions, 0),
        coverageWarnings: rows.filter((r) => r.coverageWarning).length,
      },
      preset,
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      canViewTeam: canViewTeam(user),
    };
  }

  // -------------------------------------------------------------------------
  // Employee detail
  // -------------------------------------------------------------------------
  @Get("employees/:id")
  async employee(
    @Param("id") id: string,
    @Req() req: FastifyRequest,
    @Query() q: RangeQuery,
  ) {
    const user = userFromRequest(req);
    assertCanViewPeople(user);
    if (!canViewDeveloper(user, id)) throw new ForbiddenException("out_of_scope");

    const { range, preset } = rangeFrom(q);
    const profile = await getEmployee(user.organizationId, id);
    if (!profile) throw new NotFoundException("employee_not_found");

    const scope = { organizationId: user.organizationId, developerId: id };
    const prev = previousRange(range);

    const [
      totals,
      previousTotals,
      trend,
      tools,
      hours,
      weekdays,
      classes,
      categories,
      models,
      projectUsage,
      devices,
      gaps,
      recent,
      fileChangeWorkspaces,
      fileChangeTrendSeries,
      aiSubscriptions,
    ] = await Promise.all([
      activityTotals(scope, range),
      activityTotals(scope, prev),
      dailyTrend(scope, range),
      toolDistribution(scope, range),
      hourOfDayPattern(scope, range),
      weekdayPattern(scope, range),
      classificationSplit(scope, range),
      toolCategoryBreakdown(scope, range),
      modelBreakdown(scope, range),
      projectBreakdown(scope, range),
      employeeDevices(user.organizationId, id),
      idlePeriods(user.organizationId, id, range, 8),
      listSessions({
        organizationId: user.organizationId,
        developerId: id,
        from: range.from,
        to: range.to,
        limit: 8,
      }),
      safeAnalytics("workspaceFileChanges", () => workspaceFileChanges(scope, range), []),
      safeAnalytics("fileChangeTrend", () => fileChangeTrend(scope, range), []),
      employeeAiSubscriptions(user.organizationId, id),
    ]);

    return {
      preset,
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      employee: profile,
      devices,
      totals,
      previousTotals,
      dailyTrend: trend,
      tools,
      hourPattern: hours,
      weekdayPattern: weekdays,
      classifications: classes,
      toolCategories: categories,
      models,
      projects: projectUsage,
      fileChangeWorkspaces,
      fileChangeTrend: fileChangeTrendSeries,
      aiSubscriptions,
      idlePeriods: gaps,
      recentSessions: recent.sessions,
      totalSessions: recent.total,
    };
  }

  // -------------------------------------------------------------------------
  // Employee → one AI tool
  // -------------------------------------------------------------------------
  @Get("employees/:id/tools/:provider")
  async employeeTool(
    @Param("id") id: string,
    @Param("provider") provider: string,
    @Req() req: FastifyRequest,
    @Query() q: RangeQuery,
  ) {
    const user = userFromRequest(req);
    assertCanViewPeople(user);
    if (!canViewDeveloper(user, id)) throw new ForbiddenException("out_of_scope");

    const { range, preset } = rangeFrom(q);
    const profile = await getEmployee(user.organizationId, id);
    if (!profile) throw new NotFoundException("employee_not_found");

    const scope = { organizationId: user.organizationId, developerId: id, provider };
    const allScope = { organizationId: user.organizationId, developerId: id };
    const prev = previousRange(range);

    const [
      totals,
      previousTotals,
      allTools,
      trend,
      hours,
      classes,
      categories,
      models,
      projectUsage,
      sessions,
    ] = await Promise.all([
      activityTotals(scope, range),
      activityTotals(scope, prev),
      toolDistribution(allScope, range),
      dailyTrend(scope, range),
      hourOfDayPattern(scope, range),
      classificationSplit(scope, range),
      toolCategoryBreakdown(scope, range),
      modelBreakdown(scope, range),
      projectBreakdown(scope, range),
      listSessions({
        organizationId: user.organizationId,
        developerId: id,
        provider,
        from: range.from,
        to: range.to,
        limit: 15,
      }),
    ]);

    const capability = PROVIDER_CAPABILITIES[provider] ?? null;

    return {
      preset,
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      employee: profile,
      provider,
      capability,
      totals,
      previousTotals,
      shareOfEmployeeActiveMs: allTools.reduce((s, t) => s + t.activeMs, 0),
      dailyTrend: trend,
      hourPattern: hours,
      classifications: classes,
      toolCategories: categories,
      models,
      projects: projectUsage,
      sessions: sessions.sessions,
      totalSessions: sessions.total,
    };
  }

  // -------------------------------------------------------------------------
  // Session history
  // -------------------------------------------------------------------------
  @Get("employees/:id/sessions")
  async employeeSessions(
    @Param("id") id: string,
    @Req() req: FastifyRequest,
    @Query()
    q: RangeQuery & {
      provider?: string;
      classification?: string;
      projectId?: string;
      workItemId?: string;
      coverageState?: string;
      clockHour?: string;
      page?: string;
      pageSize?: string;
    },
  ) {
    const user = userFromRequest(req);
    assertCanViewPeople(user);
    if (!canViewDeveloper(user, id)) throw new ForbiddenException("out_of_scope");

    const { range, preset } = rangeFrom(q);
    const pageSize = Math.min(Number(q.pageSize ?? 25) || 25, 100);
    const page = Math.max(Number(q.page ?? 1) || 1, 1);

    const [profile, result] = await Promise.all([
      getEmployee(user.organizationId, id),
      listSessions({
        organizationId: user.organizationId,
        developerId: id,
        provider: q.provider || undefined,
        classification: q.classification || undefined,
        projectId: q.projectId || undefined,
        workItemId: q.workItemId || undefined,
        coverageState: q.coverageState || undefined,
        clockHour:
          q.clockHour != null && q.clockHour !== ""
            ? Number(q.clockHour)
            : undefined,
        from: range.from,
        to: range.to,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      }),
    ]);
    if (!profile) throw new NotFoundException("employee_not_found");

    return {
      preset,
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      employee: profile,
      sessions: result.sessions,
      total: result.total,
      matched: result.matched,
      page,
      pageSize,
    };
  }

  // -------------------------------------------------------------------------
  // One session
  // -------------------------------------------------------------------------
  @Get("sessions/:id")
  async session(@Param("id") id: string, @Req() req: FastifyRequest) {
    const user = userFromRequest(req);
    assertCanViewPeople(user);
    const detail = await getSessionDetail(user.organizationId, id);
    if (!detail) throw new NotFoundException("session_not_found");
    if (!canViewDeveloper(user, detail.session.developerId)) {
      throw new ForbiddenException("out_of_scope");
    }
    const employee = await getEmployee(
      user.organizationId,
      detail.session.developerId,
    );
    const capability = PROVIDER_CAPABILITIES[detail.session.provider] ?? null;
    return { ...detail, employee, capability };
  }

  // -------------------------------------------------------------------------
  // Coverage (used by the org overview + connector health)
  // -------------------------------------------------------------------------
  @Get("analytics/coverage")
  async coverage(@Req() req: FastifyRequest, @Query() q: RangeQuery) {
    const user = userFromRequest(req);
    const { range } = rangeFrom(q);
    return coverageSummary(user.organizationId, range, scopeDeveloperIds(user));
  }
}
