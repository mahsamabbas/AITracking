import {
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Query,
  Req,
  UseGuards,
  BadRequestException,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import {
  activityTotals,
  aiProgress,
  aiUsageLeaderboard,
  activityCalendar,
  workday,
  listActivityFeed,
  LEADERBOARD_SORTS,
  type LeaderboardSort,
  aiProgressTimeline,
  catalogCapability,
  effectiveCapabilities,
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
  commitSummary,
  employeeAiSubscriptions,
  deleteEmployeeWithData,
  type AuthUser,
  type DateRange,
} from "@techlio/server-core";
import { PROVIDER_CAPABILITIES } from "@techlio/event-schema";
import { eq } from "drizzle-orm";
import { DashboardAuthGuard, requireRoles } from "./auth/guards.js";
import { orgAccessFromRequest } from "./auth/org-scope.js";
import { reportingTimezoneFromRequest } from "./auth/reporting-timezone.js";

interface RangeQuery {
  preset?: string;
  from?: string;
  to?: string;
}

/**
 * Resolves the page's date filter in the organisation / viewer timezone, so
 * "Today" is the same local day that every chart and the workday groups by.
 */
async function rangeFor(
  req: FastifyRequest,
  organizationId: string,
  q: RangeQuery,
): Promise<{ range: DateRange; preset: string }> {
  const timeZone = await reportingTimezoneFromRequest(req, organizationId);
  return resolveRange({ preset: q.preset, from: q.from, to: q.to, timeZone });
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
    const { organizationId, actor: user } = await orgAccessFromRequest(req);
    requireRoles(user, ["administrator", "manager", "developer"]);
    const { range, preset } = await rangeFor(req, organizationId, q);
    const timeZone = await reportingTimezoneFromRequest(req, organizationId);
    const data = await organizationAnalytics({
      organizationId: organizationId,
      range,
      team: q.team || undefined,
      provider: q.provider || undefined,
      developerIds: scopeDeveloperIds(user),
      timeZone,
    });
    return { ...data, preset, scope: user.role === "developer" ? "self" : "organization" };
  }

  // -------------------------------------------------------------------------
  // Filter vocabulary shared by every screen
  // -------------------------------------------------------------------------
  @Get("meta/filters")
  async filters(@Req() req: FastifyRequest) {
    const { organizationId, actor: user } = await orgAccessFromRequest(req);
    requireRoles(user, ["administrator", "manager", "developer", "auditor"]);
    const timeZone = await reportingTimezoneFromRequest(req, organizationId);
    const [teams, projectRows, workItemRows] = await Promise.all([
      listTeams(organizationId),
      db
        .select({ id: projects.id, name: projects.name })
        .from(projects)
        .where(eq(projects.organizationId, organizationId)),
      db
        .select({ id: workItems.id, title: workItems.title, projectId: workItems.projectId })
        .from(workItems)
        .where(eq(workItems.organizationId, organizationId)),
    ]);
    return {
      teams,
      projects: projectRows,
      workItems: workItemRows,
      timezone: timeZone,
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
  // AI usage leaderboard — administrators and managers only. Developers and
  // auditors never see other people's usage.
  // -------------------------------------------------------------------------
  @Get("leaderboard")
  async leaderboard(
    @Req() req: FastifyRequest,
    @Query() q: RangeQuery & { team?: string; provider?: string; sort?: string },
  ) {
    const { organizationId, actor: user } = await orgAccessFromRequest(req);
    requireRoles(user, ["administrator", "manager"]);
    const { range, preset } = await rangeFor(req, organizationId, q);
    const sort: LeaderboardSort = LEADERBOARD_SORTS.includes(q.sort as LeaderboardSort)
      ? (q.sort as LeaderboardSort)
      : "active";
    const rows = await aiUsageLeaderboard({
      organizationId: organizationId,
      range,
      team: q.team || undefined,
      provider: q.provider || undefined,
      sort,
    });
    return {
      rows,
      sort,
      summary: {
        listed: rows.length,
        withActivity: rows.filter((r) => r.sessions > 0 || r.providerRequests != null).length,
        activeMs: rows.reduce((sum, r) => sum + r.activeMs, 0),
        sessions: rows.reduce((sum, r) => sum + r.sessions, 0),
      },
      preset,
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
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
    const { organizationId, actor: user } = await orgAccessFromRequest(req);
    assertCanViewPeople(user);
    const { range, preset } = await rangeFor(req, organizationId, q);
    const timeZone = await reportingTimezoneFromRequest(req, organizationId);
    const rows = await listEmployeeDirectory({
      organizationId: organizationId,
      range,
      search: q.search || undefined,
      team: q.team || undefined,
      provider: q.provider || undefined,
      status: q.status || undefined,
      connectorState: q.connectorState || undefined,
      developerIds: scopeDeveloperIds(user),
      sort: (q.sort as "name" | "activity" | "sessions" | "recent") || "activity",
      timeZone,
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
  @Delete("employees/:id")
  async removeEmployee(@Param("id") id: string, @Req() req: FastifyRequest) {
    const { organizationId, actor: user } = await orgAccessFromRequest(req);
    requireRoles(user, ["administrator"]);
    if (user.developerId === id) {
      throw new BadRequestException("cannot_delete_own_employee_record");
    }
    try {
      const summary = await deleteEmployeeWithData({
        organizationId,
        employeeId: id,
        actorId: user.id,
      });
      return { ok: true, summary };
    } catch (err) {
      const code = err instanceof Error ? err.message : "delete_failed";
      if (code === "employee_not_found") throw new NotFoundException(code);
      throw new BadRequestException(code);
    }
  }

  @Get("employees/:id")
  async employee(
    @Param("id") id: string,
    @Req() req: FastifyRequest,
    @Query() q: RangeQuery,
  ) {
    const { organizationId, actor: user } = await orgAccessFromRequest(req);
    assertCanViewPeople(user);
    if (!canViewDeveloper(user, id)) throw new ForbiddenException("out_of_scope");

    const { range, preset } = await rangeFor(req, organizationId, q);
    const timeZone = await reportingTimezoneFromRequest(req, organizationId);
    const profile = await getEmployee(organizationId, id);
    if (!profile) throw new NotFoundException("employee_not_found");

    const scope = { organizationId: organizationId, developerId: id, timeZone };
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
      progress,
      commits,
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
      employeeDevices(organizationId, id),
      idlePeriods(organizationId, id, range, 8),
      listSessions({
        organizationId: organizationId,
        developerId: id,
        from: range.from,
        to: range.to,
        limit: 8,
      }),
      safeAnalytics("workspaceFileChanges", () => workspaceFileChanges(scope, range), []),
      safeAnalytics("fileChangeTrend", () => fileChangeTrend(scope, range), []),
      employeeAiSubscriptions(organizationId, id),
      aiProgress({ organizationId: organizationId, developerId: id, range, timeZone }),
      safeAnalytics("commitSummary", () => commitSummary(scope, range), null),
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
      /** Commit → Verified → Shipped (counts only; from commit_created / commit_pushed events). */
      commits,
      aiSubscriptions,
      /** Unified AI Progress: per-provider rollup, effective capabilities, Tier B daily, coverage. */
      aiProgress: progress,
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
    const { organizationId, actor: user } = await orgAccessFromRequest(req);
    assertCanViewPeople(user);
    if (!canViewDeveloper(user, id)) throw new ForbiddenException("out_of_scope");

    const { range, preset } = await rangeFor(req, organizationId, q);
    const timeZone = await reportingTimezoneFromRequest(req, organizationId);
    const profile = await getEmployee(organizationId, id);
    if (!profile) throw new NotFoundException("employee_not_found");

    const scope = { organizationId: organizationId, developerId: id, provider, timeZone };
    const allScope = { organizationId: organizationId, developerId: id, timeZone };
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
        organizationId: organizationId,
        developerId: id,
        provider,
        from: range.from,
        to: range.to,
        limit: 15,
      }),
    ]);

    const capability = await capabilityFor(organizationId, id, provider);

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
  /**
   * GET /v1/employees/:id/ai-progress/timeline?date=YYYY-MM-DD
   * Hourly activity by provider for one day in the org timezone, plus that
   * day's sessions. Developers may only request themselves.
   */
  @Get("employees/:id/ai-progress/timeline")
  async progressTimeline(
    @Param("id") id: string,
    @Req() req: FastifyRequest,
    @Query("date") date?: string,
  ) {
    const { organizationId, actor: user } = await orgAccessFromRequest(req);
    assertCanViewPeople(user);
    if (!canViewDeveloper(user, id)) throw new ForbiddenException("out_of_scope");
    const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : new Date().toISOString().slice(0, 10);
    const timeZone = await reportingTimezoneFromRequest(req, organizationId);
    return aiProgressTimeline({ organizationId: organizationId, developerId: id, date: day, timeZone });
  }

  /** One year of daily AI agent activity for the contribution-style graph. */
  @Get("employees/:id/activity-calendar")
  async employeeActivityCalendar(@Param("id") id: string, @Req() req: FastifyRequest) {
    const { organizationId, actor: user } = await orgAccessFromRequest(req);
    assertCanViewPeople(user);
    if (!canViewDeveloper(user, id)) throw new ForbiddenException("out_of_scope");
    const timeZone = await reportingTimezoneFromRequest(req, organizationId);
    return activityCalendar({ organizationId: organizationId, developerId: id, timeZone });
  }

  /**
   * Activity feed for the page's selected range: every agent event (no
   * heartbeats), newest first, paged with `cursor`. Developers only ever see
   * their own; auditors see no individual activity.
   */
  @Get("activity")
  async activityFeed(
    @Req() req: FastifyRequest,
    @Query() q: RangeQuery & { developerId?: string; provider?: string; team?: string; cursor?: string; limit?: string },
  ) {
    const { organizationId, actor: user } = await orgAccessFromRequest(req);
    assertCanViewPeople(user);
    if (q.developerId && !canViewDeveloper(user, q.developerId)) throw new ForbiddenException("out_of_scope");
    const scoped = scopeDeveloperIds(user);
    const { range, preset } = await rangeFor(req, organizationId, q);
    const feed = await listActivityFeed({
      organizationId: organizationId,
      range,
      developerIds: q.developerId ? [q.developerId] : scoped,
      provider: q.provider || undefined,
      team: q.team || undefined,
      cursor: q.cursor || undefined,
      limit: Number(q.limit) || 50,
    });
    return { ...feed, preset };
  }

  /** One day, hour by hour: working periods, breaks, AI active / idle / exploration minutes. */
  @Get("employees/:id/workday")
  async employeeWorkday(
    @Param("id") id: string,
    @Req() req: FastifyRequest,
    @Query("date") date?: string,
  ) {
    const { organizationId, actor: user } = await orgAccessFromRequest(req);
    assertCanViewPeople(user);
    if (!canViewDeveloper(user, id)) throw new ForbiddenException("out_of_scope");
    const timeZone = await reportingTimezoneFromRequest(req, organizationId);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
    const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today;
    return workday({ organizationId: organizationId, developerId: id, date: day, timeZone });
  }

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
    const { organizationId, actor: user } = await orgAccessFromRequest(req);
    assertCanViewPeople(user);
    if (!canViewDeveloper(user, id)) throw new ForbiddenException("out_of_scope");

    const { range, preset } = await rangeFor(req, organizationId, q);
    const pageSize = Math.min(Number(q.pageSize ?? 25) || 25, 100);
    const page = Math.max(Number(q.page ?? 1) || 1, 1);

    const [profile, result] = await Promise.all([
      getEmployee(organizationId, id),
      listSessions({
        organizationId: organizationId,
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
    const { organizationId, actor: user } = await orgAccessFromRequest(req);
    assertCanViewPeople(user);
    const detail = await getSessionDetail(organizationId, id);
    if (!detail) throw new NotFoundException("session_not_found");
    if (!canViewDeveloper(user, detail.session.developerId)) {
      throw new ForbiddenException("out_of_scope");
    }
    const employee = await getEmployee(
      organizationId,
      detail.session.developerId,
    );
    const capability = await capabilityFor(
      organizationId,
      detail.session.developerId,
      detail.session.provider,
    );
    return { ...detail, employee, capability };
  }

  // -------------------------------------------------------------------------
  // Coverage (used by the org overview + connector health)
  // -------------------------------------------------------------------------
  @Get("analytics/coverage")
  async coverage(@Req() req: FastifyRequest, @Query() q: RangeQuery) {
    const { organizationId, actor: user } = await orgAccessFromRequest(req);
    const { range } = await rangeFor(req, organizationId, q);
    return coverageSummary(organizationId, range, scopeDeveloperIds(user));
  }
}

/**
 * Provider capability as shown on the tool and session pages: the static
 * catalog entry with `missing` replaced by the live connector report when one
 * exists (FR-012). `capabilitySource` says which one the UI is showing.
 */
async function capabilityFor(organizationId: string, developerId: string, provider: string) {
  const base = PROVIDER_CAPABILITIES[provider];
  if (!base) return null;
  const live = (await effectiveCapabilities(organizationId, developerId)).get(provider);
  const eff = live ?? catalogCapability(provider);
  return {
    ...base,
    missing: eff.missing,
    unavailable: eff.unavailable,
    emptyState: eff.missing.length ? base.emptyState : "",
    capabilitySource: eff.source,
    reportedAt: eff.reportedAt,
    observedVia: eff.observedVia,
  };
}
