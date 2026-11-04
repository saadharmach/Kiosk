import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { RestaurantTokenPayload } from "../auth/token.service.js";

/** The tenant, taken from the token — never from a URL parameter or the body. */
export const Tenant = createParamDecorator(
  (_d: unknown, ctx: ExecutionContext): { restaurantId: string; slug: string; userId: string; role: string } => {
    const u = ctx.switchToHttp().getRequest().user as RestaurantTokenPayload;
    return { restaurantId: u.rid, slug: u.slug, userId: u.sub, role: u.role };
  },
);