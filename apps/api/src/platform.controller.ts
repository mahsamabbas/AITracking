import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import {
  addOrganizationAdmin,
  createOrganization,
  listOrganizations,
  setOrganizationDisabled,
} from "@techlio/server-core";
import { DashboardAuthGuard, requireRoles, userFromRequest } from "./auth/guards.js";

/**
 * Platform console (multi-tenant). Only the super admin may list, create, or
 * disable organisations and add their administrators. The super admin has no
 * access to any organisation's activity: every analytics route requires an
 * organisation role.
 */
@Controller("v1/platform")
@UseGuards(DashboardAuthGuard)
export class PlatformController {
  @Get("organizations")
  async list(@Req() req: FastifyRequest) {
    requireRoles(userFromRequest(req), ["super_admin"]);
    return { organizations: await listOrganizations() };
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
