import {
  BadRequestException,
  Body,
  ForbiddenException,
  Controller,
  Headers,
  HttpCode,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import { devAffordancesEnabled, getDevice, organizationDisabled, verifyDeviceToken } from "@techlio/server-core";
import { ingestBatch } from "./services/ingest.js";
import { verifyBatchSignature } from "./signatures.js";

@Controller("v1/events")
export class EventsController {
  @Post("batch")
  async batch(
    @Headers("authorization") auth: string | undefined,
    @Headers("x-device-id") deviceHeader: string | undefined,
    @Headers("x-signature") signature: string | undefined,
    @Body() body: unknown,
  ) {
    if (!auth?.startsWith("Bearer ")) {
      throw new UnauthorizedException();
    }
    const token = auth.slice(7);
    const events = (body as { events?: { device_id?: string; organization_id?: string }[] })
      ?.events;
    const deviceId = deviceHeader ?? events?.[0]?.device_id;
    if (!deviceId) throw new UnauthorizedException("device_required");

    const verified = await verifyDeviceToken(deviceId, token);
    if (!verified.ok) throw new UnauthorizedException("invalid_token");

    const orgId = verified.organizationId;
    if (!orgId || (events?.[0]?.organization_id && events[0].organization_id !== orgId)) {
      throw new UnauthorizedException("org_mismatch");
    }

    // A disabled organisation (platform super admin) stops accepting activity.
    if (await organizationDisabled(orgId)) throw new ForbiddenException("organization_disabled");

    const device = await getDevice(orgId, deviceId);
    const isLocalDevBypass = token === "dev-device-token" && devAffordancesEnabled();
    if (!isLocalDevBypass) {
      if (!device?.publicKey || !signature) {
        throw new UnauthorizedException("signed_batch_required");
      }
      const validSignature = await verifyBatchSignature({
        publicKey: device.publicKey,
        signature,
        body: JSON.stringify(body),
      });
      if (!validSignature) {
        throw new UnauthorizedException("invalid_signature");
      }
    }

    // A connector may only report its own developer's activity; only the
    // worker's provider_pull devices may submit Tier B daily aggregates.
    const result = await ingestBatch(orgId, body, deviceId, {
      developerId: device?.kind === "provider_pull" ? undefined : verified.developerId,
      allowTierB: device?.kind === "provider_pull",
    });
    if (result.accepted === 0 && result.rejected > 0 && result.reasons?.every((r) => r.startsWith("schema"))) {
      // Nothing usable: say so instead of a 2xx the connector would treat as delivered.
      throw new BadRequestException({ error: "invalid_batch", ...result });
    }
    return result;
  }

  @Post("timesheet")
  @HttpCode(404)
  rejectTimesheet() {
    return { error: "timesheet_import_not_supported", statusCode: 404 };
  }
}
