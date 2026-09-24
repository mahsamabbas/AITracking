import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import {
  authenticatePortalUser,
  getPortalUserById,
  homePathForRole,
  listDeveloperDevices,
} from "@techlio/server-core";
import { signUserToken, verifyUserToken } from "./jwt.js";

@Controller("v1/auth")
export class AuthController {
  @Post("login")
  async login(@Body() body: { email?: string; password?: string }) {
    const email = body.email ?? "";
    const password = body.password ?? "";
    const user = await authenticatePortalUser(email, password);
    if (!user) throw new UnauthorizedException("invalid_credentials");
    const token = signUserToken({
      ...user,
      developerId: user.developerId ?? undefined,
    });
    let homePath = homePathForRole(user.role, user.developerId);
    if (user.role === "developer" && user.developerId) {
      const mine = await listDeveloperDevices(user.organizationId, user.developerId);
      if (mine.length === 0) homePath = "/my-connectors";
    }
    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        organizationId: user.organizationId,
        developerId: user.developerId ?? null,
        avatarUrl: user.avatarUrl ?? null,
      },
      homePath,
    };
  }

  @Get("me")
  async me(@Headers("authorization") auth?: string) {
    if (!auth?.startsWith("Bearer ")) throw new UnauthorizedException();
    const tokenUser = verifyUserToken(auth.slice(7));
    const user = await getPortalUserById(tokenUser.id);
    if (!user) throw new UnauthorizedException();
    return { user };
  }
}
