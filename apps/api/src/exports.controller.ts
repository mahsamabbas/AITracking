import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  canExportActivity,
  createActivityExport,
  getActivityExport,
} from "@techlio/server-core";
import { DashboardAuthGuard, userFromRequest } from "./auth/guards.js";
import { reportingTimezoneFromRequest } from "./auth/reporting-timezone.js";

@Controller("v1/activity-exports")
@UseGuards(DashboardAuthGuard)
export class ExportsController {
  @Post()
  async create(
    @Req() req: FastifyRequest,
    @Body()
    body: {
      format?: "csv" | "pdf";
      developerId?: string;
      preset?: string;
      from?: string;
      to?: string;
      team?: string;
      provider?: string;
    },
  ) {
    const user = userFromRequest(req);
    if (!canExportActivity(user)) {
      throw new ForbiddenException("role_forbidden");
    }
    const result = await createActivityExport({
      organizationId: user.organizationId,
      requestedBy: user.id,
      format: body.format ?? "csv",
      developerId: body.developerId,
      preset: body.preset,
      from: body.from,
      to: body.to,
      team: body.team || undefined,
      provider: body.provider || undefined,
      timeZone: await reportingTimezoneFromRequest(req, user.organizationId),
    });
    return result;
  }

  @Get(":id")
  async download(
    @Param("id") id: string,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const user = userFromRequest(req);
    if (!canExportActivity(user)) {
      throw new ForbiddenException("role_forbidden");
    }
    const file = await getActivityExport(user.organizationId, id);
    if (!file) {
      reply.status(404).send({ error: "not_found" });
      return;
    }
    const type =
      file.format === "csv" ? "text/csv; charset=utf-8" : "application/pdf";
    const body =
      file.format === "pdf"
        ? Buffer.from(file.content, "base64")
        : file.content;
    reply
      .header("Content-Type", type)
      .header(
        "Content-Disposition",
        `attachment; filename="activity-export-${id}.${file.format === "pdf" ? "pdf" : "csv"}"`,
      )
      .send(body);
  }
}
