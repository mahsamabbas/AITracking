import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import {
  addOrganizationAdmin,
  createOrganization,
  getCustomerOrganization,
  listOrganizations,
  setOrganizationDisabled,
} from "@techlio/server-core";
import { DashboardAuthGuard, requireRoles, userFromRequest } from "./auth/guards.js";

/**
 * Platform console (multi-tenant). Super admins create organisations and may
 * open any customer tenant in read-only mode from the web app (org context header).
 */
@Controller("v1/platform")
@UseGuards(DashboardAuthGuard)
export class PlatformController {
  @Get("organizations")
  async list(@Req() req: FastifyRequest) {
    requireRoles(userFromRequest(req), ["super_admin"]);
    return { organizations: await listOrganizations() };
  }

  @Get("organizations/:id")
  async one(@Req() req: FastifyRequest, @Param("id") id: string) {
    requireRoles(userFromRequest(req), ["super_admin"]);
    const org = await getCustomerOrganization(id);
    if (!org) throw new NotFoundException("organization_not_found");
    const rows = await listOrganizations();
    const summary = rows.find((o) => o.id === id);
    return {
      organization: {
        ...org,
        createdAt: summary?.createdAt ?? null,
        administrators: summary?.administrators ?? 0,
        users: summary?.users ?? 0,
        employees: summary?.employees ?? 0,
        connectors: summary?.connectors ?? 0,
        lastActivityAt: summary?.lastActivityAt ?? null,
      },
    };
  }

  @Post("organizations")
  async create(
    @Req() req: FastifyRequest,
    @Body() body: { name?: string; timezone?: string; adminEmail?: string; adminName?: string },
  ) {
    const user = userFromRequest(req);
    requireRoles(user, ["super_admin"]);
    if (!body.name || !body.adminEmail?.includes("@") || !body.adminName) {
      throw new BadRequestException("name_admin_email_and_name_required");
    }
    try {
      return await createOrganization({
        actor: user,
        name: body.name,
        timezone: body.timezone,
        adminEmail: body.adminEmail,
        adminName: body.adminName,
      });
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : "could_not_create_organization");
    }
  }

  @Post("organizations/:id/admins")
  async addAdmin(
    @Req() req: FastifyRequest,
    @Param("id") id: string,
    @Body() body: { email?: string; name?: string },
  ) {
    const user = userFromRequest(req);
    requireRoles(user, ["super_admin"]);
    if (!body.email?.includes("@") || !body.name) throw new BadRequestException("email_and_name_required");
    try {
      return { admin: await addOrganizationAdmin({ actor: user, organizationId: id, email: body.email, name: body.name }) };
    } catch (err) {
      const message = err instanceof Error ? err.message : "could_not_add_admin";
      // Duplicate email → unique violation from Postgres.
      throw new BadRequestException(/duplicate|unique/i.test(message) ? "email_already_used" : message);
    }
  }

  @Patch("organizations/:id")
  async update(@Req() req: FastifyRequest, @Param("id") id: string, @Body() body: { disabled?: boolean }) {
    const user = userFromRequest(req);
    requireRoles(user, ["super_admin"]);
    if (typeof body.disabled !== "boolean") throw new BadRequestException("disabled_required");
    try {
      await setOrganizationDisabled({ actor: user, organizationId: id, disabled: body.disabled });
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : "could_not_update");
    }
    return { ok: true };
  }
}
