import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import type { Request } from "express";
import type { RestaurantTokenPayload } from "../../auth/token.service.js";

/**
 * Refuses any request whose :slug does not match the slug inside the token.
 * Runs before the controller, so a missing where-clause can never leak data.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & { user?: RestaurantTokenPayload }>();
    const user = req.user;
    if (!user || user.type !== "restaurant") throw new ForbiddenException("Not a restaurant session");

    const slug = (req.params as Record<string, string | undefined>)?.slug;
    if (slug && slug !== user.slug) throw new ForbiddenException("Wrong restaurant");
    return true;
  }
}