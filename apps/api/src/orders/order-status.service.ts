import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

/**
 * Mirrors the Prisma enums as plain string unions so this file has no
 * dependency on how the generated client is imported elsewhere.
 * Keep in sync with enum OrderStatus / OrderActor in schema.prisma.
 */
export type OrderStatusName =
  | "DRAFT"
  | "PENDING"
  | "SENT"
  | "CONFIRMED"
  | "PAID"
  | "FAILED"
  | "CANCELLED";

export type OrderActorName = "KIOSK" | "SYSTEM" | "RESTAURANT_USER" | "PLATFORM_USER";

export interface TransitionParams {
  restaurantId: string;
  orderId: string;
  to: OrderStatusName;
  actor: OrderActorName;
  actorId?: string | null;
  reason?: string | null;
  meta?: Record<string, unknown>;
  /** Extra order columns written in the same transaction (TPAPI result fields). */
  patch?: Record<string, unknown>;
}

/** The only legal moves. Anything not listed here is rejected. */
const ALLOWED: Record<OrderStatusName, OrderStatusName[]> = {
  DRAFT: ["PENDING", "CANCELLED"],
  PENDING: ["SENT", "FAILED", "CANCELLED"],
  SENT: ["CONFIRMED", "FAILED", "CANCELLED"],
  CONFIRMED: ["PAID", "CANCELLED"],
  FAILED: ["PENDING", "CANCELLED"],
  PAID: [],
  CANCELLED: [],
};

/** Which timestamp column is stamped when we arrive at a status. */
const STAMP: Partial<Record<OrderStatusName, string>> = {
  SENT: "sentAt",
  CONFIRMED: "confirmedAt",
  PAID: "paidDetectedAt",
  FAILED: "failedAt",
  CANCELLED: "cancelledAt",
};

@Injectable()
export class OrderStatusService {
  private readonly logger = new Logger(OrderStatusService.name);

  constructor(private readonly prisma: PrismaService) {}

  static allowedFrom(from: OrderStatusName): OrderStatusName[] {
    return ALLOWED[from] ?? [];
  }

  static can(from: OrderStatusName, to: OrderStatusName): boolean {
    return (ALLOWED[from] ?? []).includes(to);
  }

  static isTerminal(status: OrderStatusName): boolean {
    return (ALLOWED[status] ?? []).length === 0;
  }

  /**
   * Moves one order to a new status, stamps the matching timestamp and writes
   * an OrderStatusHistory row, atomically. Always scoped by restaurantId, so a
   * tenant can never touch another tenant's order even with a valid order id.
   */
  async transition(p: TransitionParams) {
    const order = await this.prisma.order.findFirst({
      where: { id: p.orderId, restaurantId: p.restaurantId },
      select: { id: true, reference: true, status: true },
    });
    if (!order) throw new NotFoundException("Order not found");

    const from = order.status as OrderStatusName;

    // Idempotent: asking for the status it already has is a no-op, not an error.
    if (from === p.to) {
      return { id: order.id, reference: order.reference, status: from, changed: false };
    }

    if (!OrderStatusService.can(from, p.to)) {
      const allowed = OrderStatusService.allowedFrom(from);
      throw new BadRequestException(
        allowed.length === 0
          ? `Order ${order.reference} is ${from}, which is final. It cannot become ${p.to}.`
          : `Order ${order.reference} cannot go from ${from} to ${p.to}. Allowed: ${allowed.join(", ")}.`,
      );
    }

    const data: Record<string, unknown> = { status: p.to, ...(p.patch ?? {}) };
    const stampField = STAMP[p.to];
    if (stampField && data[stampField] === undefined) data[stampField] = new Date();

    const result = await this.prisma.$transaction(async (tx) => {
      // status: from  => optimistic lock. Two concurrent callers cannot both win.
      const written = await tx.order.updateMany({
        where: { id: order.id, restaurantId: p.restaurantId, status: from as never },
        data: data as never,
      });
      if (written.count === 0) {
        throw new ConflictException(
          `Order ${order.reference} changed status while this request was in flight. Reload and retry.`,
        );
      }

      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          restaurantId: p.restaurantId,
          fromStatus: from as never,
          toStatus: p.to as never,
          actor: p.actor as never,
          actorId: p.actorId ?? null,
          reason: p.reason ?? null,
          meta: (p.meta ?? {}) as never,
        },
      });

      return tx.order.findUniqueOrThrow({
        where: { id: order.id },
        select: { id: true, reference: true, status: true, updatedAt: true },
      });
    });

    this.logger.log(`Order ${result.reference}: ${from} -> ${p.to} by ${p.actor}`);
    return { ...result, changed: true };
  }

  /** Full audit trail for one order, oldest first. */
  async history(restaurantId: string, orderId: string) {
    return this.prisma.orderStatusHistory.findMany({
      where: { orderId, restaurantId },
      orderBy: { createdAt: "asc" },
      select: {
        fromStatus: true,
        toStatus: true,
        actor: true,
        actorId: true,
        reason: true,
        createdAt: true,
      },
    });
  }
}
