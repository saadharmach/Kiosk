import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from "@nestjs/common";
import type { Request } from "express";
import { tap } from "rxjs";
import { PrismaService } from "../prisma/prisma.service.js";

const WRITES = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const ADMIN_RESTAURANT = /^\/api\/admin\/restaurants\/([0-9a-f-]{36})(\/|$)/;

/**
 * Which restaurant a successful change was about, if any: the back office's own restaurant (from its token), or the
 * restaurant an admin page acted on (from the address). The kiosk's own requests (orders...) are not changes.
 */
export function changedRestaurant(req: Pick<Request, "method" | "originalUrl" | "path"> & { user?: unknown }): string | null {
  if (!WRITES.has(req.method)) return null;
  const path = (req.originalUrl ?? req.path ?? "").split("?")[0]!;
  const user = req.user as { type?: string; rid?: string } | undefined;
  if (path.startsWith("/api/restaurant/") && user?.type === "restaurant" && user.rid) return user.rid;
  const m = ADMIN_RESTAURANT.exec(path);
  return m && (user as { type?: string } | undefined)?.type === "platform" ? m[1]! : null;
}

/**
 * After every successful change in the back office or the admin, marks the restaurant as changed, so its kiosks
 * reload what they show. In one place on purpose: a new page can never forget to do it.
 */
@Injectable()
export class ContentChangedInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ContentChangedInterceptor.name);
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    const req = context.switchToHttp().getRequest<Request & { user?: unknown }>();
    return next.handle().pipe(
      // Only once it worked (tap runs on success), and never in the way of the answer.
      tap(() => {
        const id = changedRestaurant(req);
        if (id) void markChanged(this.prisma, id).catch((e) => this.logger.warn(`Could not mark ${id} changed: ${String(e)}`));
      }),
    );
  }
}

/** Kiosks of this restaurant reload what they show. Scoped to the restaurant by its own id. */
export function markChanged(prisma: Pick<PrismaService, "restaurant">, restaurantId: string) {
  return prisma.restaurant.updateMany({ where: { id: restaurantId }, data: { contentChangedAt: new Date() } });
}
