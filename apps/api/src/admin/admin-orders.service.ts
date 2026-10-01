import { Injectable, NotFoundException } from "@nestjs/common";
import type { Request } from "express";
import { AuditService } from "../common/audit.service.js";
import { OrderSubmitService } from "../orders/order-submit.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { RestaurantOrdersService, type OrderListQuery } from "../restaurant/restaurant-orders.service.js";

type Actor = { id: string };

/**
 * The platform team's view of one restaurant's orders. Reading uses the same code as the restaurant's own
 * back office (always scoped by the restaurant). The two actions are logged against the person who did them.
 */
@Injectable()
export class AdminOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: RestaurantOrdersService,
    private readonly submitter: OrderSubmitService,
    private readonly audit: AuditService,
  ) {}

  async list(restaurantId: string, q: OrderListQuery) {
    await this.requireRestaurant(restaurantId);
    return this.orders.list(restaurantId, q);
  }

  async detail(restaurantId: string, orderId: string) {
    await this.requireRestaurant(restaurantId);
    return this.orders.detail(restaurantId, orderId);
  }

  /** Looks at the till again for an order we sent: the till is only read, never written to. SENT orders only. */
  async verify(restaurantId: string, orderId: string, actor: Actor, req?: Request) {
    const result = await this.submitter.verify(restaurantId, orderId);
    await this.audit.record(
      {
        restaurantId, actorType: "PLATFORM_USER", actorId: actor.id,
        action: "order.verify", entityType: "Order", entityId: orderId,
        after: { reference: result.reference, confirmed: result.confirmed === true },
      },
      req,
    );
    return result;
  }

  /** Puts a FAILED order back in the queue to be sent to the till again. */
  async retry(restaurantId: string, orderId: string, actor: Actor, req?: Request) {
    const result = await this.orders.retry(restaurantId, orderId, actor.id, "PLATFORM_USER");
    await this.audit.record(
      {
        restaurantId, actorType: "PLATFORM_USER", actorId: actor.id,
        action: "order.retry", entityType: "Order", entityId: orderId,
      },
      req,
    );
    return result;
  }

  private async requireRestaurant(restaurantId: string) {
    const r = await this.prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { id: true } });
    if (!r) throw new NotFoundException("Restaurant not found");
  }
}
