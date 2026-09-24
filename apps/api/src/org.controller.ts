import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import {
  canViewAudit,
  createPortalUser,
  getOrgPolicy,
  listAuditLog,
  listOrgDevices,
  listPortalUsers,
  ORG_ASSIGNABLE_ROLES,
  type OrgAssignableRole,
} from "@techlio/server-core";
import { DashboardAuthGuard, requireRoles, userFromRequest } from "./auth/guards.js";

@Controller("v1")
@UseGuards(DashboardAuthGuard)
export class OrgController {
  @Get("users")
  async users(@Req() req: FastifyRequest) {
    const user = userFromRequest(req);
    requireRoles(user, ["administrator"]);
    const users = await listPortalUsers(user.organizationId);
    const devices = await listOrgDevices(user.organizationId).catch(() => []);
    const connected = new Set(
      devices.filter((d) => !d.revokedAt).map((d) => d.developerId),
    );
    return {
      users: users.map((u) => ({
        ...u,
        hasConnector: Boolean(u.developerId && connected.has(u.developerId)),
      })),
    };
  }

  @Post("users")
  async createUser(
    @Req() req: FastifyRequest,
    @Body()
    body: {
      email?: string;
      password?: string;
      displayName?: string;
      role?: OrgAssignableRole;
      developerId?: string;
    },
  ) {
    const user = userFromRequest(req);
    requireRoles(user, ["administrator"]);
    if (!body.email || !body.password || !body.displayName || !body.role) {
      return { error: "email_password_name_role_required" };
    }
    if (!ORG_ASSIGNABLE_ROLES.includes(body.role)) {
      return { error: "invalid_role" };
    }
    try {
      const created = await createPortalUser({
        organizationId: user.organizationId,
        actorId: user.id,
        email: body.email,
        password: body.password,
        displayName: body.displayName,
        role: body.role,
        developerId: body.developerId,
      });
      return { user: created };
    } catch (err) {
      if (err instanceof Error && err.message === "email_already_used") {
        return { error: "email_already_used" };
      }
      return { error: "could_not_create_user" };
    }
  }

  @Get("org/developers")
  async developers(@Req() req: FastifyRequest) {
    const user = userFromRequest(req);
    requireRoles(user, ["administrator", "manager", "developer", "auditor"]);
    const members = await listPortalUsers(user.organizationId);
    const deviceRows = await listOrgDevices(user.organizationId);
    const seen = new Map<
      string,
      { developerId: string; displayName: string; email?: string }
    >();
    for (const m of members) {
      if (m.role === "developer" && m.developerId) {
        seen.set(m.developerId, {
          developerId: m.developerId,
          displayName: m.displayName,
          email: m.email,
        });
      }
    }
    for (const d of deviceRows) {
      if (!seen.has(d.developerId)) {
        seen.set(d.developerId, {
          developerId: d.developerId,
          displayName: `Developer ${d.developerId.slice(0, 8)}`,
        });
      }
    }
    let developers = [...seen.values()];
    if (user.role === "developer") {
      developers = developers.filter((d) => d.developerId === user.developerId);
    }
    return { developers };
  }

  @Get("audit-log")
  async audit(@Req() req: FastifyRequest, @Query("limit") limit?: string) {
    const user = userFromRequest(req);
    if (!canViewAudit(user)) requireRoles(user, ["auditor"]);
    const rows = await listAuditLog(
      user.organizationId,
      Math.min(Number(limit ?? 100) || 100, 200),
    );
    return { entries: rows };
  }

  @Get("org/policy")
  async policy(@Req() req: FastifyRequest) {
    const user = userFromRequest(req);
    requireRoles(user, ["administrator", "manager", "developer", "auditor"]);
    return {
      organizationId: user.organizationId,
      ...getOrgPolicy(),
    };
  }
}
