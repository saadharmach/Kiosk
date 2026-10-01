import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { ALLOW_WHILE_PASSWORD_CHANGE } from "../decorators/allow-while-password-change.decorator.js";
import { PlatformUserDirectory } from "../platform-user-directory.js";
import { TokenService } from "../token.service.js";

/** The code the admin screen looks for to show "choose a new password" instead of the page. */
export const PASSWORD_CHANGE_REQUIRED = "PASSWORD_CHANGE_REQUIRED";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly directory: PlatformUserDirectory,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user?: unknown }>();
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw new UnauthorizedException("Missing bearer token");

    let payload;
    try {
      payload = await this.tokens.verifyAccessToken(header.slice(7));
    } catch {
      throw new UnauthorizedException("Invalid or expired token");
    }

    // The token says who this was when it was issued. What matters is who they are now.
    const standing = await this.directory.standing(payload.sub);
    if (!standing || !standing.isActive) throw new UnauthorizedException("This account is switched off");

    const allowed = this.reflector.getAllAndOverride<boolean | undefined>(ALLOW_WHILE_PASSWORD_CHANGE, [context.getHandler(), context.getClass()]);
    if (standing.mustChangePassword && !allowed) {
      throw new ForbiddenException({ code: PASSWORD_CHANGE_REQUIRED, message: "Choose a new password before doing anything else" });
    }

    req.user = { ...payload, role: standing.role };   // the role they have now, not the one in the token
    return true;
  }
}
