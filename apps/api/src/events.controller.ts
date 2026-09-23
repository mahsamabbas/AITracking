import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import { devAffordancesEnabled, getDevice, verifyDeviceToken } from "@techlio/server-core";
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

    return ingestBatch(orgId, body, deviceId);
  }

  @Post("timesheet")
  @HttpCode(404)
  rejectTimesheet() {
    return { error: "timesheet_import_not_supported", statusCode: 404 };
  }
}
