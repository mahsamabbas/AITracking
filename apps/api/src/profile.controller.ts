import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import {
  changePortalPassword,
  getOrganizationBranding,
  normalizeAvatarDataUrl,
  updateOrganizationLogo,
  updatePortalProfile,
} from "@techlio/server-core";
import { DashboardAuthGuard, requireRoles, userFromRequest } from "./auth/guards.js";
import { orgAccessFromRequest } from "./auth/org-scope.js";
import { signUserToken } from "./auth/jwt.js";

@Controller("v1")
@UseGuards(DashboardAuthGuard)
export class ProfileController {
  @Patch("me")
  async updateMe(
    @Req() req: FastifyRequest,
    @Body()
    body: {
      email?: string;
      displayName?: string;
      avatarUrl?: string | null;
      team?: string | null;
      title?: string | null;
    },
  ) {
    const user = userFromRequest(req);
    let avatarUrl: string | null | undefined;
    if (body.avatarUrl !== undefined) {
      try {
        avatarUrl = normalizeAvatarDataUrl(body.avatarUrl);
      } catch (err) {
        const code = err instanceof Error ? err.message : "invalid_image";
        throw new BadRequestException(code);
      }
    }
    try {
      const updated = await updatePortalProfile(user.id, {
        email: body.email,
        displayName: body.displayName,
        avatarUrl,
        team: body.team,
        title: body.title,
      });
      const token = signUserToken({
        id: updated.id,
        email: updated.email,
        displayName: updated.displayName,
        role: updated.role,
        organizationId: updated.organizationId,
        developerId: updated.developerId ?? undefined,
      });
      return { user: updated, token };
    } catch (err) {
      const code = err instanceof Error ? err.message : "update_failed";
      throw new BadRequestException(code);
    }
  }

  @Patch("me/password")
  async changePassword(
    @Req() req: FastifyRequest,
    @Body() body: { currentPassword?: string; newPassword?: string },
  ) {
    const user = userFromRequest(req);
    if (!body.currentPassword || !body.newPassword) {
      throw new BadRequestException("current_and_new_password_required");
    }
    try {
      await changePortalPassword(user.id, body.currentPassword, body.newPassword);
      return { ok: true };
    } catch (err) {
      const code = err instanceof Error ? err.message : "password_change_failed";
      throw new BadRequestException(code);
    }
  }

  @Get("org/branding")
  async branding(@Req() req: FastifyRequest) {
    const { organizationId, actor: user } = await orgAccessFromRequest(req);
    requireRoles(user, ["administrator", "manager", "developer", "auditor", "super_admin"]);
    const row = await getOrganizationBranding(organizationId);
    if (!row) throw new BadRequestException("organization_not_found");
    return { organization: row };
  }

  @Patch("org/branding")
  async updateBranding(@Req() req: FastifyRequest, @Body() body: { logoUrl?: string | null }) {
    const { organizationId, actor: user } = await orgAccessFromRequest(req);
    requireRoles(user, ["administrator"]);
    if (body.logoUrl === undefined) throw new BadRequestException("logo_required");
    try {
      const result = await updateOrganizationLogo({
        organizationId,
        actorId: user.id,
        logoUrl: body.logoUrl,
      });
      return result;
    } catch (err) {
      const code = err instanceof Error ? err.message : "invalid_image";
      throw new BadRequestException(code);
    }
  }
}
