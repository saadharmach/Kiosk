import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { requireOrderable, requireSubscribed, resolveBorne } from "./availability.js";
import { PricingService, type PricedCart } from "./pricing.service.js";
import type { CreateOrderDto } from "./dto/cart.dto.js";
import type { Prisma } from "@prisma/client";
import { resolveLocale } from "../common/locale.js";
import { PrintingService, type LoadedOrder } from "../printing/printing.service.js";
import { readTableRanges, tableInRanges } from "../common/table-ranges.js";

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly printing: PrintingService,
  ) {}

  async create(slug: string, dto: CreateOrderDto) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { slug },
      select: { id: true, name: true, currency: true, status: true, settings: true, locale: true, timezone: true },
    });
    requireOrderable(restaurant);
    await requireSubscribed(this.prisma, restaurant);
    const restaurantId = restaurant.id;

    // ---- idempotency: the same clientOrderId always returns the same order. (Which borne this is, is looked up at the
    // same time; a switched-off borne only matters if this turns out to be a new order.)
    const [existing, borne] = await Promise.all([
      this.prisma.order.findFirst({ where: { restaurantId, clientRequestId: dto.clientOrderId }, include: { items: true } }),
      resolveBorne(this.prisma, restaurantId, restaurant.name, dto.borneCode).then((b) => ({ b }), (e: unknown) => ({ e })),
    ]);
    if (existing) return this.present(existing);
    if ("e" in borne) throw borne.e;
    const borneInfo = borne.b;

    this.assertOrderTypeEnabled(restaurant.settings, dto.orderType);

    const priced = await this.pricing.price(restaurantId, restaurant.currency, {
      ...dto,
      locale: resolveLocale(dto.locale, restaurant.locale),
    });

    // ---- the price the customer saw must match what we just computed
    if (dto.displayedTotalCents !== undefined) {
      const computed = Math.round(priced.total * 100);
      if (computed !== dto.displayedTotalCents) {
        throw new ConflictException({
          code: "PRICES_CHANGED",
          message: "Prices changed while ordering",
          cart: priced,
        });
      }
    }

    // ---- table
     const businessDate = new Date(new Date().toISOString().slice(0, 10));
    const order = await this.prisma.$transaction(async (tx) => {
      // Serialise table allocation per restaurant. Two kiosks finishing in the
      // same instant would otherwise both take the lowest free number, and unTill
      // merges same-table orders onto one bill. The lock releases on commit, so
      // allocation and insert are atomic together.
      await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${restaurantId}))`;

      const { tableNumber, tablePart } = await this.resolveTable(
        restaurantId,
        dto,
        priced.salesAreaId,
        tx,
      );
      const counter = await tx.orderCounter.upsert({
        where: { restaurantId_businessDate: { restaurantId, businessDate } },
        create: { restaurantId, businessDate, lastSequence: 1 },
        update: { lastSequence: { increment: 1 } },
        select: { lastSequence: true },
      });
      const seq = counter.lastSequence;
      const mmdd = `${String(businessDate.getUTCMonth() + 1).padStart(2, "0")}${String(businessDate.getUTCDate()).padStart(2, "0")}`;
      // The borne's code leads the reference (K2-1002-014), so staff see which machine an order came from. K0: no borne.
      const reference = `${borneInfo?.code ?? "K0"}-${mmdd}-${String(seq).padStart(3, "0")}`;

      const created = await tx.order.create({
        data: {
          restaurantId,
          kioskId: borneInfo?.id ?? null,
          clientRequestId: dto.clientOrderId,
          reference,
          businessDate,
          dailySequence: seq,
          orderType: dto.orderType,
          status: "PENDING",
          salesAreaId: BigInt(priced.salesAreaId),
          tableNumber,
          tablePart,
          priceLevelId: BigInt(priced.priceLevelId),
          currency: priced.currency,
          subtotal: priced.subtotal,
          taxTotal: priced.taxTotal,
          total: priced.total,
          itemCount: priced.itemCount,
          customerName: dto.customerName ?? null,
          items: { create: this.buildItems(restaurantId, priced) },
        },
        include: { items: true },
      });

      await tx.orderStatusHistory.create({
        data: { orderId: created.id, restaurantId, toStatus: "PENDING", actor: "KIOSK" },
      });
      return created;
    });

    this.logger.log(`Order ${order.reference} created (${priced.total} ${priced.currency})`);
    // The ticket is queued once the order is safely stored. It never fails the order, and the
    // promise has its own catch so a printing problem can never become an unhandled rejection.
    void this.printing.enqueueForOrder(restaurantId, order.id, true, order as unknown as LoadedOrder).catch(() => undefined);
    return this.present(order);
  }

  preview(slug: string, dto: CreateOrderDto | Parameters<PricingService["price"]>[2]) {
    return this.prisma.restaurant
      .findUnique({ where: { slug }, select: { id: true, name: true, currency: true, status: true, settings: true, locale: true, timezone: true } })
      .then(async (r) => {
        requireOrderable(r);
        await requireSubscribed(this.prisma, r);
        // Same rule as create(): no point quoting a price for an order that would be refused.
        this.assertOrderTypeEnabled(r.settings, dto.orderType);
        return this.pricing.price(r.id, r.currency, {
          ...(dto as never as Parameters<PricingService["price"]>[2]),
          locale: resolveLocale(dto.locale, r.locale),
        });
      });
  }

  private assertOrderTypeEnabled(
    s: { eatInEnabled: boolean; takeAwayEnabled: boolean; deliveryEnabled: boolean } | null,
    orderType: string,
  ) {
    const enabled =
      (orderType === "EAT_IN" && (s?.eatInEnabled ?? true)) ||
      (orderType === "TAKE_AWAY" && (s?.takeAwayEnabled ?? false)) ||
      (orderType === "DELIVERY" && (s?.deliveryEnabled ?? false));
    if (!enabled) throw new BadRequestException(`${orderType} is not enabled for this restaurant`);
  }

  /** Flat TPAPI-shaped lines: product first, its modifiers after, pointing back at it. */
  private buildItems(restaurantId: string, priced: PricedCart) {
    const rows: Record<string, unknown>[] = [];
    let lineNumber = 0;

    for (const line of priced.lines) {
      lineNumber += 1;
      const parent = lineNumber;
      rows.push({
        restaurantId,
        lineNumber: parent,
        kind: "PRODUCT",
        articleId: BigInt(line.articleId),
        articleName: line.name,
        displayName: line.displayName,
        quantity: line.quantity,
        unitPrice: line.basePrice,
        lineTotal: line.basePrice * line.quantity,
        vatRate: line.vatRate,
        text: line.note ?? null,
      });

      for (const m of line.modifiers) {
        lineNumber += 1;
        rows.push({
          restaurantId,
          lineNumber,
          parentLineNumber: parent,
          // A menu's choices are components; otherwise the kind says which of unTill's option types it is.
          kind: m.kind === "SIZE" ? "SIZE" : line.isMenu ? "MENU_CHOICE" : m.kind === "SUPPLEMENT" ? "SUPPLEMENT" : m.kind === "CONDIMENT" ? "CONDIMENT" : "OPTION",
          articleId: m.articleId ? BigInt(m.articleId) : null,
          articleName: m.name,
          quantity: line.quantity,
          unitPrice: m.unitPrice,
          lineTotal: m.unitPrice * line.quantity,
          optionGroupId: m.optionGroupId ? BigInt(m.optionGroupId) : null,
          sizeItemId: m.sizeItemId ? BigInt(m.sizeItemId) : null,
          sizeName: m.kind === "SIZE" ? m.name : null,
        });
      }
    }
    return rows as never;
  }

    private async resolveTable(
    restaurantId: string,
    dto: CreateOrderDto,
    salesAreaId: string,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const mapping = await this.prisma.orderTypeMapping.findFirst({
      where: { restaurantId, orderType: dto.orderType, isEnabled: true },
    });

       if (dto.orderType === "EAT_IN") {
      const settings = await this.prisma.restaurantSettings.findFirst({
        where: { restaurantId },
        select: { askTableForEatIn: true },
      });

      // When the kiosk asks, the customer's table must be real. When it doesn't,
      // they take a numbered stand and every order lands on one configured table;
      // the cashier still finds the bill by OrderName.
      if (settings?.askTableForEatIn ?? true) {
        if (!dto.tableNumber) throw new BadRequestException("A table number is required for eat-in");
        const area = await this.prisma.tpapiSalesArea.findFirst({
          where: { restaurantId, untillId: BigInt(salesAreaId) },
        });
        if (!tableInRanges(dto.tableNumber, readTableRanges(area?.tableRanges))) throw new BadRequestException(`Table ${dto.tableNumber} does not exist in this zone`);
        return { tableNumber: dto.tableNumber, tablePart: mapping?.tablePart ?? "" };
      }
      // Otherwise fall through to fixedTableNumber, then range allocation.
    }

    if (mapping?.fixedTableNumber) {
      return { tableNumber: mapping.fixedTableNumber, tablePart: mapping.tablePart ?? "" };
    }
    if (mapping?.tableRangeFrom) {
      // simple allocation: lowest free number in the range today
      const used = await this.prisma.order.findMany({
        where: {
          restaurantId,
          businessDate: new Date(new Date().toISOString().slice(0, 10)),
          status: { in: ["PENDING", "SENT", "CONFIRMED"] },
        },
        select: { tableNumber: true },
      });
      const taken = new Set(used.map((o) => o.tableNumber));
      for (let n = mapping.tableRangeFrom; n <= (mapping.tableRangeTo ?? mapping.tableRangeFrom); n++) {
        if (!taken.has(n)) return { tableNumber: n, tablePart: mapping.tablePart ?? "" };
      }
      throw new BadRequestException("No free table number available for this order type");
    }

    throw new BadRequestException(
      `No table strategy configured for ${dto.orderType}. Set an order type mapping for this restaurant.`,
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private present(order: any) {
    return {
      reference: order.reference,
      status: order.status,
      orderType: order.orderType,
      tableNumber: order.tableNumber,
      total: Number(order.total),
      currency: order.currency,
      itemCount: order.itemCount,
      createdAt: order.createdAt,
      payment: { method: "PAY_AT_CASHIER", instruction: "Please pay at the cashier with this number" },
      items: order.items
        .filter((i: { kind: string }) => i.kind === "PRODUCT")
        .map((i: { articleName: string; quantity: number; lineTotal: unknown }) => ({
          name: i.articleName,
          quantity: i.quantity,
          total: Number(i.lineTotal),
        })),
    };
  }

  /**
   * Ticket read-back for the kiosk. Looked up by the unguessable clientOrderId,
   * never by reference: K0-0925-003 is trivial to enumerate and this route is
   * unauthenticated. Returns exactly the same shape as create().
   */
  async getByClientOrderId(slug: string, clientOrderId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { slug },
      select: { id: true, name: true, status: true },
    });
    requireOrderable(restaurant);

    const order = await this.prisma.order.findFirst({
      where: { restaurantId: restaurant.id, clientRequestId: clientOrderId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException("Order not found");

    return this.present(order);
  }
}
