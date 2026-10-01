import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { OrderStatusService, type OrderStatusName } from "../orders/order-status.service.js";

const ORDER_STATUSES: OrderStatusName[] = [
  "DRAFT",
  "PENDING",
  "SENT",
  "CONFIRMED",
  "PAID",
  "FAILED",
  "CANCELLED",
];

export interface OrderListQuery {
  status?: string;
  from?: string;
  to?: string;
  reference?: string;
  page?: string;
  pageSize?: string;
}

function parseDay(value: string, field: string): Date {
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException(`${field} must be a date like 2026-09-25`);
  }
  return d;
}

@Injectable()
export class RestaurantOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly status: OrderStatusService,
  ) {}

  async list(restaurantId: string, q: OrderListQuery) {
    const page = Math.max(1, Number(q.page ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(q.pageSize ?? 25) || 25));

    const statuses = (q.status ?? "")
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean) as OrderStatusName[];
    for (const s of statuses) {
      if (!ORDER_STATUSES.includes(s)) {
        throw new BadRequestException(`Unknown status "${s}". Allowed: ${ORDER_STATUSES.join(", ")}`);
      }
    }

    // restaurantId comes from the TOKEN, never the URL. Always the first filter.
    const where: Record<string, unknown> = { restaurantId };
    if (statuses.length) where.status = { in: statuses };
    if (q.reference) where.reference = { contains: q.reference.trim().toUpperCase() };

    const day: Record<string, Date> = {};
    if (q.from) day.gte = parseDay(q.from, "from");
    if (q.to) day.lte = parseDay(q.to, "to");
    if (Object.keys(day).length) where.businessDate = day;

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.order.count({ where: where as never }),
      this.prisma.order.findMany({
        where: where as never,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          reference: true,
          status: true,
          orderType: true,
          tableNumber: true,
          covers: true,
          itemCount: true,
          total: true,
          currency: true,
          businessDate: true,
          createdAt: true,
          sentAt: true,
          tpapiLastError: true,
        },
      }),
    ]);

    return {
      page,
      pageSize,
      total,
      pages: Math.max(1, Math.ceil(total / pageSize)),
      orders: rows.map((r) => ({ ...r, total: Number(r.total) })),
    };
  }

  async detail(restaurantId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, restaurantId },
      include: { items: { orderBy: [{ lineNumber: "asc" }, { id: "asc" }] } },
    });
    if (!order) throw new NotFoundException("Order not found");

    const history = await this.status.history(restaurantId, orderId);

    return {
      id: order.id,
      reference: order.reference,
      status: order.status,
      allowedTransitions: OrderStatusService.allowedFrom(order.status as OrderStatusName),
      orderType: order.orderType,
      salesAreaId: order.salesAreaId,
      tableNumber: order.tableNumber,
      tablePart: order.tablePart,
      covers: order.covers,
      currency: order.currency,
      subtotal: Number(order.subtotal),
      taxTotal: Number(order.taxTotal),
      total: Number(order.total),
      itemCount: order.itemCount,
      businessDate: order.businessDate,
      createdAt: order.createdAt,
      sentAt: order.sentAt,
      confirmedAt: order.confirmedAt,
      paidDetectedAt: order.paidDetectedAt,
      cancelledAt: order.cancelledAt,
      tpapi: {
        attempts: order.tpapiAttempts,
        returnCode: order.tpapiReturnCode,
        lastError: order.tpapiLastError,
        correlationId: order.tpapiCorrelationId,
      },
      items: order.items.map((i) => ({
        lineNumber: i.lineNumber,
        parentLineNumber: i.parentLineNumber,
        kind: i.kind,
        articleId: i.articleId,
        articleName: i.articleName,
        displayName: i.displayName,
        sizeName: i.sizeName,
        optionGroupName: i.optionGroupName,
        quantity: i.quantity,
        unitPrice: Number(i.unitPrice),
        lineTotal: Number(i.lineTotal),
        text: i.text,
      })),
      history,
    };
  }

  async cancel(restaurantId: string, orderId: string, actorId: string | null, reason?: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, restaurantId },
      select: { status: true, reference: true },
    });
    if (!order) throw new NotFoundException("Order not found");
    // Cancelling here does not reach unTill, so a SENT/CONFIRMED order would still be made.
    if (order.status !== "PENDING" && order.status !== "FAILED") {
      throw new BadRequestException(
        order.status === "SENT" || order.status === "CONFIRMED"
          ? `${order.reference} is ${order.status}: it is already in unTill. Cancel it in unTill, otherwise the kitchen will still make it.`
          : `Only a PENDING or FAILED order can be cancelled. ${order.reference} is ${order.status}.`,
      );
    }
    return this.status.transition({
      restaurantId,
      orderId,
      to: "CANCELLED",
      actor: "RESTAURANT_USER",
      actorId,
      reason: reason?.trim() || "Cancelled by staff",
    });
  }

  /** `actor` says who asked: the restaurant's staff from their back office, or the platform team. */
  async retry(restaurantId: string, orderId: string, actorId: string | null, actor: "RESTAURANT_USER" | "PLATFORM_USER" = "RESTAURANT_USER") {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, restaurantId },
      select: { status: true, reference: true },
    });
    if (!order) throw new NotFoundException("Order not found");
    if (order.status !== "FAILED") {
      throw new BadRequestException(
        `Only a FAILED order can be retried. ${order.reference} is ${order.status}.`,
      );
    }
    return this.status.transition({
      restaurantId,
      orderId,
      to: "PENDING",
      actor,
      actorId,
      reason: actor === "PLATFORM_USER" ? "Retry requested by the platform team" : "Retry requested by staff",
      patch: { tpapiLastError: null },
    });
  }
}
