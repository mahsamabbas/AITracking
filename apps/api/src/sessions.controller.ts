import {
  Body,
  Controller,
  Param,
  Post,
  ForbiddenException,
  NotFoundException,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { getSessionDetail, recordSessionContext } from "@techlio/server-core";
import { DashboardAuthGuard, userFromRequest } from "./auth/guards.js";

@Controller("v1/sessions")
@UseGuards(DashboardAuthGuard)
export class SessionsController {
  @Post(":id/context")
  async setContext(
    @Param("id") sessionId: string,
    @Req() req: FastifyRequest,
    @Body()
    body: { projectId?: string; workItemId?: string; label?: string },
  ) {
    const user = userFromRequest(req);
    // FR-011: only the session's own developer records a context change, and
    // the event is attributed to the session's real device.
    const detail = await getSessionDetail(user.organizationId, sessionId);
    if (!detail) throw new NotFoundException("session_not_found");
    const developerId = detail.session.developerId;
    if (user.role !== "developer" || user.developerId !== developerId) {
      throw new ForbiddenException("only_session_owner_can_set_context");
    }
    const event = await recordSessionContext({
      organizationId: user.organizationId,
      sessionId,
      projectId: body.projectId,
      workItemId: body.workItemId,
      label: body.label,
      developerId,
      deviceId: detail.session.deviceId,
    });
    return { ok: true, eventId: event.event_id };
  }
}
