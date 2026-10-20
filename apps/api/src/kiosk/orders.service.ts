import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { requireOrderable, requireSubscribed, requireTillReachable } from "./availability.js";
import { resolveScreen } from "./screen.js";
import { PricingService, type PricedCart } from "./pricing.service.js";
import type { CreateOrderDto } from "./dto/cart.dto.js";
import type { Prisma } from "@prisma/client";
import { resolveLocale } from "../common/locale.js";
import { PrintingService, type LoadedOrder } from "../printing/printing.service.js";
import { readTableRanges, tableInRanges } from "../common/table-ranges.js";
import { PaymentsService } from "../payments/payments.service.js";

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly printing: PrintingService,
    private readonly payments: PaymentsService,
  ) {}

  async create(slug: string, dto: CreateOrderDto, screen?: string) {
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
      resolveScreen(this.prisma, restaurant, screen, dto.borneCode).then((b) => ({ b }), (e: unknown) => ({ e })),
    ]);
    if (existing) return this.present(existing, await this.latestPayment(restaurantId, existing));
    if ("e" in borne) throw borne.e;
    const borneInfo = borne.b;
    await requireTillReachable(this.prisma, restaurantId);

    this.assertOrderTypeEnabled(restaurant.settings, dto.orderType);

    // ---- how the customer pays. Card: only on a borne whose TPE is set up; the order waits for the TPE before it
    // goes to unTill, where it is closed with the card payment type. Cash: open as before, or closed at once.
    const payBy = dto.payment ?? "CASH";
    const terminal = payBy === "CARD" ? await this.payments.cardTerminal(restaurantId, restaurant.settings, borneInfo?.id ?? null) : null;
    if (payBy === "CARD") PaymentsService.assertMethod(Boolean(terminal), "Card");
    else PaymentsService.assertMethod(restaurant.settings?.cashPaymentEnabled ?? true, "Cash");
    const closing = this.closingFor(payBy, restaurant.settings);
    const firstStatus = payBy === "CARD" ? "AWAITING_PAYMENT" : "PENDING";

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
          status: firstStatus,
          paymentMethod: payBy === "CARD" ? "PAYMENT_TERMINAL" : "PAY_AT_CASHIER",
          closeInUntill: closing.closeInUntill,
          untillPaymentId: closing.untillPaymentId,
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
        data: { orderId: created.id, restaurantId, toStatus: firstStatus, actor: "KIOSK" },
      });
      return created;
    });

    this.logger.log(`Order ${order.reference} created (${priced.total} ${priced.currency}, ${payBy.toLowerCase()})`);
    if (terminal) {
      // Card: the TPE is asked to charge; the ticket prints once it is paid (PaymentsService.complete).
      return this.present(order, await this.payments.startCard(restaurantId, order, terminal));
    }
    // The ticket is queued once the order is safely stored. It never fails the order, and the
    // promise has its own catch so a printing problem can never become an unhandled rejection.
    void this.printing.enqueueForOrder(restaurantId, order.id, true, order as unknown as LoadedOrder).catch(() => undefined);
    return this.present(order);
  }

  /** Close the order in unTill right away? Card always; cash only when the restaurant chose so (and said with what). */
  private closingFor(payBy: "CARD" | "CASH", settings: { cardUntillPaymentId?: bigint | null; cashUntillPaymentId?: bigint | null; cashClosesOrder?: boolean } | null) {
    if (payBy === "CARD") return { closeInUntill: true, untillPaymentId: settings?.cardUntillPaymentId ?? null };
    const close = Boolean(settings?.cashClosesOrder && settings.cashUntillPaymentId);
    return { closeInUntill: close, untillPaymentId: close ? settings!.cashUntillPaymentId! : null };
  }

  /** A card order's latest payment attempt (a cash order has none). */
  private latestPayment(restaurantId: string, order: { id: string; paymentMethod?: string }) {
    return order.paymentMethod === "PAYMENT_TERMINAL" ? this.payments.latest(restaurantId, order.id) : Promise.resolve(null);
  }

  /** The order a kiosk is paying for: only one still waiting for its payment. */
  private async awaitingOrder(slug: string, clientOrderId: string, screen?: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { slug }, select: { id: true, name: true, status: true, settings: true, timezone: true },
    });
    requireOrderable(restaurant);
    await resolveScreen(this.prisma, restaurant, screen);
    const order = await this.prisma.order.findFirst({ where: { restaurantId: restaurant.id, clientRequestId: clientOrderId }, include: { items: true } });
    if (!order) throw new NotFoundException("Order not found");
    if (order.status !== "AWAITING_PAYMENT") throw new ConflictException({ code: "NOT_AWAITING_PAYMENT", message: `This order is ${order.status.toLowerCase()}, not waiting for a payment` });
    return { restaurant, order };
  }

  /**
   * After a declined, cancelled or failed card payment the customer chooses again: the card once more (a new attempt
   * on the borne's TPE), or cash (the order goes on, to be paid at the counter or closed as the restaurant chose).
   */
  async pay(slug: string, clientOrderId: string, method: "CARD" | "CASH", screen?: string) {
    const { restaurant, order } = await this.awaitingOrder(slug, clientOrderId, screen);
    await requireTillReachable(this.prisma, restaurant.id);
    if (method === "CARD") {
      const terminal = await this.payments.cardTerminal(restaurant.id, restaurant.settings, order.kioskId);
      PaymentsService.assertMethod(Boolean(terminal), "Card");
      return this.present(order, await this.payments.startCard(restaurant.id, order, terminal!));
    }
    PaymentsService.assertMethod(restaurant.settings?.cashPaymentEnabled ?? true, "Cash");
    await this.payments.cancel(restaurant.id, order.id);
    const closing = this.closingFor("CASH", restaurant.settings);
    await this.prisma.order.updateMany({
      where: { id: order.id, restaurantId: restaurant.id, status: "AWAITING_PAYMENT" },
      data: { paymentMethod: "PAY_AT_CASHIER", ...closing },
    });
    await this.payments.moveOn(restaurant.id, order.id, "Pays cash instead of card");
    void this.printing.enqueueForOrder(restaurant.id, order.id, true).catch(() => undefined);
    const after = await this.prisma.order.findFirstOrThrow({ where: { id: order.id, restaurantId: restaurant.id }, include: { items: true } });
    return this.present(after);
  }

  /** The customer stopped at the TPE screen: the order waits for their next choice. */
  async cancelPayment(slug: string, clientOrderId: string, screen?: string) {
    const { restaurant, order } = await this.awaitingOrder(slug, clientOrderId, screen);
    await this.payments.cancel(restaurant.id, order.id);
    return this.present(order, await this.payments.latest(restaurant.id, order.id));
  }

  /** The kiosk's test buttons, while the TPE is the simulator (never on the live server). */
  async simulatePayment(slug: string, clientOrderId: string, approve: boolean, screen?: string) {
    const { restaurant, order } = await this.awaitingOrder(slug, clientOrderId, screen);
    await this.payments.simulate(restaurant.id, order.id, approve);
    return this.getByClientOrderId(slug, clientOrderId, screen);
  }

  preview(slug: string, dto: CreateOrderDto | Parameters<PricingService["price"]>[2], screen?: string) {
    return this.prisma.restaurant
      .findUnique({ where: { slug }, select: { id: true, name: true, currency: true, status: true, settings: true, locale: true, timezone: true } })
      .then(async (r) => {
        requireOrderable(r);
        await requireSubscribed(this.prisma, r);
        await resolveScreen(this.prisma, r, screen);
        await requireTillReachable(this.prisma, r.id);
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
  private present(order: any, payment?: { id: string; status: string; message: string | null } | null) {
    const card = order.paymentMethod === "PAYMENT_TERMINAL";
    return {
      reference: order.reference,
      status: order.status,
      orderType: order.orderType,
      tableNumber: order.tableNumber,
      total: Number(order.total),
      currency: order.currency,
      itemCount: order.itemCount,
      createdAt: order.createdAt,
      payment: {
        // Kept for kiosk pages that only know these two.
        method: card ? "PAYMENT_TERMINAL" : "PAY_AT_CASHIER",
        instruction: card ? "Paid by card" : "Please pay at the cashier with this number",
        by: card ? "CARD" : "CASH",
        /** Paid by card: the TPE approved it. */
        paid: card && order.status !== "AWAITING_PAYMENT" && order.status !== "CANCELLED",
        /** The latest card attempt, while the kiosk waits on the TPE. */
        attempt: payment ? { status: payment.status, message: payment.message } : null,
      },
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
  async getByClientOrderId(slug: string, clientOrderId: string, screen?: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { slug },
      select: { id: true, name: true, status: true, settings: { select: { requireRegisteredBornes: true } } },
    });
    requireOrderable(restaurant);
    await resolveScreen(this.prisma, restaurant, screen);

    const order = await this.prisma.order.findFirst({
      where: { restaurantId: restaurant.id, clientRequestId: clientOrderId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException("Order not found");

    return this.present(order, await this.latestPayment(restaurant.id, order));
  }
}
