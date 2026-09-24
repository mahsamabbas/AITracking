import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import { db, projects, workItems } from "@techlio/server-core";
import { eq, and } from "drizzle-orm";
import { DashboardAuthGuard } from "./auth/guards.js";
import { orgAccessFromRequest } from "./auth/org-scope.js";
import type { FastifyRequest } from "fastify";

@Controller("v1")
@UseGuards(DashboardAuthGuard)
export class ProjectsController {
  @Get("projects")
  async listProjects(@Req() req: FastifyRequest) {
    const { organizationId } = await orgAccessFromRequest(req);
    const rows = await db
      .select()
      .from(projects)
      .where(eq(projects.organizationId, organizationId));
    return { projects: rows };
  }

  @Get("work-items")
  async listWorkItems(
    @Req() req: FastifyRequest,
    @Query("q") q?: string,
    @Query("projectId") projectId?: string,
  ) {
    const { organizationId } = await orgAccessFromRequest(req);
    const conditions = [eq(workItems.organizationId, organizationId)];
    if (projectId) conditions.push(eq(workItems.projectId, projectId));
    let rows = await db
      .select()
      .from(workItems)
      .where(and(...conditions));
    if (q) {
      const needle = q.toLowerCase();
      rows = rows.filter((r) => r.title.toLowerCase().includes(needle));
    }
    return { workItems: rows };
  }
}
