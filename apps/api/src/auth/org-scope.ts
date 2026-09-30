import { ForbiddenException } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import {
  resolveOrgAccess,
  TECHLIO_ORG_CONTEXT_HEADER,
  type AuthUser,
} from "@techlio/server-core";
import { userFromRequest } from "./guards.js";

function headerOrgId(req: FastifyRequest): string | undefined {
  const raw = req.headers[TECHLIO_ORG_CONTEXT_HEADER];
  return typeof raw === "string" ? raw.trim() : undefined;
}

export async function orgAccessFromRequest(req: FastifyRequest): Promise<{
  organizationId: string;
  actor: AuthUser;
  platformView: boolean;
}> {
  const user = userFromRequest(req);
  try {
    return await resolveOrgAccess(user, headerOrgId(req));
  } catch (err) {
    const code = err instanceof Error ? err.message : "org_context_forbidden";
    throw new ForbiddenException(code);
  }
}

