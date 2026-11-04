import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

/**
 * The record of every conversation with a restaurant's till, newest first. Only who/what/when/result is
 * shown: the request and response summaries stored with each call (they hold the order lines that were sent)
 * stay in the database.
 */
@Injectable()
export class TillLogService {
  constructor(private readonly prisma: PrismaService) {}

  async list(restaurantId: string, q: { page?: number; failuresOnly?: boolean; pageSize?: number } = {}) {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { id: true } });
    if (!restaurant) throw new NotFoundException("Restaurant not found");

    const page = Math.max(1, q.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, q.pageSize ?? 40));
    const where = { restaurantId, ...(q.failuresOnly ? { ok: false } : {}) };

    const [total, rows] = await Promise.all([
      this.prisma.integrationLog.count({ where }),
      this.prisma.integrationLog.findMany({
        where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize,
        select: { id: true, createdAt: true, kind: true, operation: true, ok: true, level: true, returnCode: true, message: true, durationMs: true, orderId: true, correlationId: true },
      }),
    ]);

    // Show the order's reference (K0-1001-002), which people recognise, not its internal id.
    const orderIds = [...new Set(rows.map((r) => r.orderId).filter((x): x is string => Boolean(x)))];
    const orders = orderIds.length
      ? await this.prisma.order.findMany({ where: { restaurantId, id: { in: orderIds } }, select: { id: true, reference: true } })
      : [];
    const referenceOf = new Map(orders.map((o) => [o.id, o.reference]));

    return {
      items: rows.map(({ orderId, ...r }) => ({ ...r, at: r.createdAt, orderId, orderReference: orderId ? (referenceOf.get(orderId) ?? null) : null })),
      total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }
}
