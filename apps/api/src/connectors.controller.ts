import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import {
  db,
  connectorHealth,
  registerDevice,
  revokeDevice,
  verifyDeviceToken,
  recordLiveHeartbeat,
  hashDeviceToken,
  ingestBatch,
  getDevice,
  bindDevicePublicKey,
  writeAudit,
  setConnectorPaused,
  canPauseConnector,
  canRegisterConnector,
  canViewConnectorHealth,
  ensureEmployee,
  listPortalUsers,
  listDeveloperDevices,
} from "@techlio/server-core";
import { eq } from "drizzle-orm";
import { EventTypes } from "@techlio/event-schema";
import { randomUUID } from "node:crypto";
import { DashboardAuthGuard, requireRoles, userFromRequest } from "./auth/guards.js";

/**
 * Resolves a device to its owner inside the caller's organisation. An unknown
 * device is a 404 — it is never attributed to a default developer.
 */
async function resolveDeviceDeveloper(
  organizationId: string,
  deviceId: string,
): Promise<{ developerId: string; organizationId: string }> {
  const row = await getDevice(organizationId, deviceId);
  if (!row) throw new NotFoundException("device_not_found");
  return { developerId: row.developerId, organizationId: row.organizationId };
}

@Controller("v1/connectors")
export class ConnectorsController {
  @Post("register")
  @UseGuards(DashboardAuthGuard)
  async register(
    @Req() req: FastifyRequest,
    @Body() body: { developerId?: string; publicKey?: string; provider?: string; label?: string },
  ) {
    const user = userFromRequest(req);
    requireRoles(user, ["administrator"]);
    const developerId = body.developerId;
    if (!developerId) {
      throw new UnauthorizedException("developer_id_required");
    }
    if (!canRegisterConnector(user, developerId)) {
      throw new ForbiddenException("role_forbidden");
    }
    const members = await listPortalUsers(user.organizationId);
    const member = members.find((m) => m.developerId === developerId);
    if (member?.developerId) {
      await ensureEmployee({
        id: member.developerId,
        organizationId: user.organizationId,
        displayName: member.displayName,
        email: member.email,
      });
    }
    const provider = body.provider ?? "cursor";
    return registerDevice({
      organizationId: user.organizationId,
      developerId,
      publicKey: body.publicKey,
      actorId: user.id,
      provider,
      label:
        body.label?.trim() ||
        (member ? `${member.displayName} · ${provider}` : "Assigned connector"),
    });
  }

  @Post("activate")
  @UseGuards(DashboardAuthGuard)
  async activate(
    @Req() req: FastifyRequest,
    @Body()
    body: {
      deviceId?: string;
      token?: string;
      publicKey?: string;
      consentAccepted?: boolean;
      consentVersion?: string;
    },
  ) {
    const user = userFromRequest(req);
    const deviceId = body.deviceId?.trim();
    const token = body.token?.trim();
    if (!deviceId || !token) {
      throw new UnauthorizedException("device_id_and_token_required");
    }
    if (!body.publicKey) {
      throw new UnauthorizedException("public_key_required");
    }
    if (body.consentAccepted !== true || !body.consentVersion?.trim()) {
      throw new ForbiddenException("collection_notice_required");
    }
    const verified = await verifyDeviceToken(deviceId, token);
    if (!verified.ok || !verified.organizationId || !verified.developerId) {
      throw new UnauthorizedException("invalid_connector_key");
    }
    if (verified.organizationId !== user.organizationId) {
      throw new ForbiddenException("org_mismatch");
    }
    if (user.role === "developer" && user.developerId !== verified.developerId) {
      throw new ForbiddenException("role_forbidden");
    }
    if (user.role !== "developer" && user.role !== "administrator") {
      throw new ForbiddenException("role_forbidden");
    }
    const device = await getDevice(verified.organizationId, deviceId);
    if (!device || device.revokedAt) {
      throw new NotFoundException("device_not_found");
    }
    const bound = await bindDevicePublicKey(
      verified.organizationId,
      deviceId,
      body.publicKey,
    );
    if (!bound) {
      throw new ForbiddenException("signing_key_mismatch");
    }
    await writeAudit({
      organizationId: verified.organizationId,
      actorId: user.id,
      action: "connector.consent_accepted",
      detail: {
        deviceId,
        developerId: verified.developerId,
        consentVersion: body.consentVersion.trim().slice(0, 64),
      },
    });
    return {
      deviceId: device.id,
      developerId: device.developerId,
      organizationId: device.organizationId,
      provider: device.provider,
      label: device.label,
    };
  }

  @Get("mine")
  @UseGuards(DashboardAuthGuard)
  async mine(@Req() req: FastifyRequest) {
    const user = userFromRequest(req);
    const developerId = user.developerId;
    if (!developerId) {
      throw new UnauthorizedException("developer_id_required");
    }
    requireRoles(user, ["developer"]);
    const rows = await listDeveloperDevices(user.organizationId, developerId);
    return {
      devices: rows.map((d) => ({
        deviceId: d.id,
        provider: d.provider,
        label: d.label,
        createdAt: d.createdAt,
      })),
    };
  }

  @Post(":id/revoke")
  @UseGuards(DashboardAuthGuard)
  async revoke(@Param("id") id: string, @Req() req: FastifyRequest) {
    const user = userFromRequest(req);
    requireRoles(user, ["administrator"]);
    const ok = await revokeDevice(user.organizationId, id, user.id);
    if (!ok) {
      throw new NotFoundException("device_not_found");
    }
    return { revoked: true };
  }

  @Post(":id/heartbeat")
  async heartbeat(
    @Param("id") id: string,
    @Req() req: FastifyRequest,
    @Body()
    body: {
      version?: string;
      queueDepth?: number;
      paused?: boolean;
      provider?: string;
      capabilities?: Record<string, unknown>;
    },
  ) {
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) throw new UnauthorizedException();
    const token = auth.slice(7);
    const verified = await verifyDeviceToken(id, token);
    if (!verified.ok) throw new UnauthorizedException();

    await recordLiveHeartbeat({
      deviceId: id,
      organizationId: verified.organizationId!,
      developerId: verified.developerId!,
      version: body.version ?? "unknown",
      queueDepth: body.queueDepth ?? 0,
      paused: Boolean(body.paused),
      provider: body.provider ?? null,
      tokenHash: hashDeviceToken(token),
    });

    return { ok: true };
  }

  @Get(":id/health")
  @UseGuards(DashboardAuthGuard)
  async health(@Param("id") id: string, @Req() req: FastifyRequest) {
    const user = userFromRequest(req);
    if (!canViewConnectorHealth(user) && user.role !== "developer") {
      requireRoles(user, ["administrator"]);
    }
    const { developerId } = await resolveDeviceDeveloper(
      user.organizationId,
      id,
    );
    if (user.role === "developer" && user.developerId !== developerId) {
      throw new ForbiddenException("role_forbidden");
    }
    const rows = await db
      .select()
      .from(connectorHealth)
      .where(eq(connectorHealth.deviceId, id));
    const row = rows[0];
    if (!row) return { status: "offline", coverageWarning: true, developerId };
    if (row.organizationId !== user.organizationId) {
      throw new ForbiddenException("org_mismatch");
    }
    const stale =
      !row.lastHeartbeat ||
      Date.now() - row.lastHeartbeat.getTime() > 5 * 60 * 1000;
    return {
      ...row,
      developerId,
      status: stale ? "stale" : row.paused ? "paused" : "online",
      coverageWarning: stale || row.paused === 1,
    };
  }

  @Post(":id/pause")
  @UseGuards(DashboardAuthGuard)
  async pause(@Param("id") id: string, @Req() req: FastifyRequest) {
    return this.setPaused(id, req, true);
  }

  @Post(":id/resume")
  @UseGuards(DashboardAuthGuard)
  async resume(@Param("id") id: string, @Req() req: FastifyRequest) {
    return this.setPaused(id, req, false);
  }

  private async setPaused(
    id: string,
    req: FastifyRequest,
    paused: boolean,
  ) {
    const user = userFromRequest(req);
    const resolved = await resolveDeviceDeveloper(user.organizationId, id);
    if (resolved.organizationId !== user.organizationId) {
      throw new ForbiddenException("org_mismatch");
    }
    if (!canPauseConnector(user, resolved.developerId)) {
      throw new ForbiddenException("role_forbidden");
    }

    const device = await getDevice(user.organizationId, id);
    if (!device) {
      throw new NotFoundException("device_not_found");
    }

    await setConnectorPaused({
      deviceId: id,
      organizationId: user.organizationId,
      provider: device.provider,
      paused,
    });

    const gapEvent = {
      event_id: randomUUID(),
      schema_version: "1.0.0" as const,
      organization_id: user.organizationId,
      developer_id: resolved.developerId,
      device_id: id,
      provider: "api",
      connector_version: "0.1.0",
      event_type: paused
        ? EventTypes.telemetry_gap_started
        : EventTypes.telemetry_gap_ended,
      occurred_at: new Date().toISOString(),
      consent_version: "1",
      metadata: paused
        ? { gap_reason: "paused" as const, connector_paused: true }
        : { connector_paused: false },
    };

    await ingestBatch(user.organizationId, { events: [gapEvent] }, id);

    await writeAudit({
      organizationId: user.organizationId,
      actorId: user.id,
      action: paused ? "connector.pause" : "connector.resume",
      detail: { deviceId: id, developerId: resolved.developerId },
    });
    return { paused, coverageGap: paused };
  }
}
