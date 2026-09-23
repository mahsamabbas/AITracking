import jwt from "jsonwebtoken";
import { jwtSecret, type AuthUser, type Role } from "@techlio/server-core";
const JWT_EXPIRES = "12h";

export interface JwtPayload {
  sub: string;
  email: string;
  displayName: string;
  role: Role;
  organizationId: string;
  developerId?: string;
}

export function signUserToken(user: {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  organizationId: string;
  developerId?: string;
}): string {
  const payload: JwtPayload = {
    sub: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    organizationId: user.organizationId,
    developerId: user.developerId,
  };
  return jwt.sign(payload, jwtSecret(), { expiresIn: JWT_EXPIRES });
}

export function verifyUserToken(token: string): AuthUser {
  const decoded = jwt.verify(token, jwtSecret()) as JwtPayload;
  return {
    id: decoded.sub,
    email: decoded.email,
    displayName: decoded.displayName,
    organizationId: decoded.organizationId,
    role: decoded.role,
    developerId: decoded.developerId,
  };
}
