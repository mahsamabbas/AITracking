import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { devAffordancesEnabled, type AuthUser, type Role } from "@techlio/server-core";
import { verifyUserToken } from "./jwt.js";
import { DEV_DEVELOPER, DEV_ORG } from "../constants.js";

export function userFromRequest(req: FastifyRequest): AuthUser {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) {
    try {
      return verifyUserToken(auth.slice(7));
    } catch {
      throw new UnauthorizedException("invalid_token");
    }
  }
  // Header identity is a local-development convenience only. Outside dev mode
  // an unauthenticated request never resolves to a user.
  if (!devAffordancesEnabled()) {
    throw new UnauthorizedException("token_required");
  }
  const role = (req.headers["x-role"] as string | undefined) ?? "manager";
  return {
    id: (req.headers["x-user-id"] as string) ?? "user-1",
    organizationId: (req.headers["x-org-id"] as string) ?? DEV_ORG,
    role: role as Role,
    developerId: DEV_DEVELOPER,
    displayName: "Dev user",
    email: "dev@local",
  };
}

@Injectable()
export class DashboardAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const auth = req.headers.authorization;
    if (auth?.startsWith("Bearer ")) {
      try {
        verifyUserToken(auth.slice(7));
        return true;
      } catch {
        throw new UnauthorizedException("invalid_token");
      }
    }
    if (!devAffordancesEnabled()) {
      throw new UnauthorizedException("token_required");
    }
    return true;
  }
}

export function requireRoles(user: AuthUser, allowed: Role[]): void {
  if (!allowed.includes(user.role)) {
    throw new ForbiddenException("role_forbidden");
  }
}
