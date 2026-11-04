import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

/** The audit trail of one restaurant, newest first, for platform staff. */
@Injectable()
export class ActivityService {
  constructor(private readonly prisma: PrismaService) {}

  async list(restaurantId: string, page = 1, pageSize = 30) {
    const where = { restaurantId };
    const [total, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize,
        // before/after are left out on purpose: the screen shows who did what, not the data.
        select: { id: true, createdAt: true, actorType: true, actorId: true, actorLabel: true, action: true, entityType: true, entityId: true },
      }),
    ]);

    const ids = (type: string) => [...new Set(rows.filter((r) => r.actorType === type && r.actorId).map((r) => r.actorId!))];
    const [platform, restaurant] = await Promise.all([
      this.prisma.platformUser.findMany({ where: { id: { in: ids("PLATFORM_USER") } }, select: { id: true, email: true } }),
      this.prisma.restaurantUser.findMany({ where: { restaurantId, id: { in: ids("RESTAURANT_USER") } }, select: { id: true, email: true } }),
    ]);
    const emailOf = new Map([...platform, ...restaurant].map((u) => [u.id, u.email]));

    return {
      items: rows.map((r) => ({
        id: r.id,
        at: r.createdAt,
        actorType: r.actorType,
        actor: (r.actorId ? emailOf.get(r.actorId) : undefined) ?? r.actorLabel ?? (r.actorType === "SYSTEM" ? "System" : null),
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
      })),
      total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }
}
