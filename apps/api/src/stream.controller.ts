import { Controller, Get, Query, Req, Res, UnauthorizedException } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { listRecentEvents } from "./services/ingest.js";
import { verifyUserToken } from "./auth/jwt.js";

@Controller("v1/stream")
export class StreamController {
  @Get("sse")
  async sse(
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
    @Query("access_token") accessToken?: string,
  ) {
    const header = req.headers.authorization;
    const raw = header?.startsWith("Bearer ")
      ? header.slice(7)
      : accessToken;
    if (!raw) throw new UnauthorizedException("token_required");
    let organizationId: string;
    try {
      organizationId = verifyUserToken(raw).organizationId;
    } catch {
      throw new UnauthorizedException("invalid_token");
    }

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const send = async () => {
      try {
        const events = await listRecentEvents(organizationId, 10);
        const payload = JSON.stringify({
          at: new Date().toISOString(),
          recentCount: events.length,
          latestType: events[0]?.event_type ?? null,
        });
        reply.raw.write(`data: ${payload}\n\n`);
      } catch {
        reply.raw.write(
          `data: ${JSON.stringify({ at: new Date().toISOString(), error: "db_unavailable" })}\n\n`,
        );
      }
    };

    await send();
    const interval = setInterval(() => void send(), 15_000);
    req.raw.on("close", () => clearInterval(interval));
  }
}
