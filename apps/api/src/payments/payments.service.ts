import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { OrderStatusService } from "../orders/order-status.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { PrintingService } from "../printing/printing.service.js";
import { providerFor, simulatorAllowed, type PaymentProvider } from "./payment-providers.js";

/** A TPE that has not answered after this long: the payment fails, the customer chooses again. */
export const PAYMENT_TIMEOUT_MS = 3 * 60_000;
/** An order left waiting for payment this long (the customer walked away): cancelled. */
export const ABANDONED_ORDER_MS = 20 * 60_000;

type Terminal = { id: string; name: string; provider: string | null; config: unknown };
type CardSettings = { cardPaymentEnabled?: boolean; cardUntillPaymentId?: bigint | null };

/**
 * Can this borne take cards? The restaurant switched card payment on and chose the unTill payment type for it, and the
 * borne has a TPE that is switched on and that this server knows how to use. A machine with no borne never takes cards.
 */
export async function findCardTerminal(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the Prisma client, or a test's stand-in
  prisma: { paymentTerminal: { findFirst: (a: any) => Promise<Terminal | null> } },
  restaurantId: string,
  settings: CardSettings | null | undefined,
  kioskId: string | null,
): Promise<(Terminal & { use: PaymentProvider }) | null> {
  if (!settings?.cardPaymentEnabled || !settings.cardUntillPaymentId || !kioskId) return null;
  const t = await prisma.paymentTerminal.findFirst({
    where: { restaurantId, kioskId, isEnabled: true },
    select: { id: true, name: true, provider: true, config: true },
  });
  const use = providerFor(t?.provider);
  return t && use ? { ...t, use } : null;
}

/**
 * Card payments at the borne. The order waits (AWAITING_PAYMENT, not in unTill) while the borne's TPE charges its
 * total; approved, it goes on to unTill, where it is closed with the card payment type. Every attempt is a Payment row:
 * declined, cancelled or timed out, the customer can try again or pay cash instead. All writes are scoped by restaurant.
 */
@Injectable()
export class PaymentsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PaymentsService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly status: OrderStatusService,
    private readonly printing: PrintingService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.expire().catch((e) => this.logger.error(`Payment expiry failed: ${String(e)}`)), 30_000);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** The borne's TPE, if card payment can be offered there (see findCardTerminal). */
  cardTerminal(restaurantId: string, settings: CardSettings | null | undefined, kioskId: string | null) {
    return findCardTerminal(this.prisma, restaurantId, settings, kioskId);
  }

  /** Asks the TPE to charge the order. A charge already waiting is given back instead of starting a second one. */
  async startCard(restaurantId: string, order: { id: string; reference: string; total: unknown; currency: string }, terminal: Terminal & { use: PaymentProvider }) {
    const waiting = await this.prisma.payment.findFirst({ where: { restaurantId, orderId: order.id, status: "PENDING" } });
    if (waiting) return waiting;
    const payment = await this.prisma.payment.create({
      data: { restaurantId, orderId: order.id, terminalId: terminal.id, amount: order.total as never, currency: order.currency, provider: terminal.provider ?? "UNKNOWN" },
    });
    try {
      await terminal.use.start({ paymentId: payment.id, amount: Number(order.total), currency: order.currency, reference: order.reference, terminal });
      return payment;
    } catch (e) {
      const message = `The card terminal could not be reached: ${e instanceof Error ? e.message : String(e)}`;
      this.logger.warn(`${order.reference}: ${message}`);
      await this.prisma.payment.updateMany({ where: { id: payment.id, restaurantId, status: "PENDING" }, data: { status: "FAILED", message, completedAt: new Date() } });
      return { ...payment, status: "FAILED" as const, message };
    }
  }

  /**
   * The TPE's answer. Only a payment still waiting is changed (a late or repeated answer changes nothing). Approved,
   * the order goes on: queued for unTill (where it is closed) and its ticket printed.
   */
  async complete(restaurantId: string, paymentId: string, result: { approved: boolean; providerRef?: string | null; message?: string | null }) {
    const done = await this.prisma.payment.updateMany({
      where: { id: paymentId, restaurantId, status: "PENDING" },
      data: { status: result.approved ? "APPROVED" : "DECLINED", providerRef: result.providerRef ?? null, message: result.message ?? null, completedAt: new Date() },
    });
    const payment = await this.prisma.payment.findFirst({ where: { id: paymentId, restaurantId } });
    if (!payment) throw new NotFoundException("Payment not found");
    if (done.count === 0 || !result.approved) return payment;

    const order = await this.prisma.order.findFirst({ where: { id: payment.orderId, restaurantId }, select: { id: true, reference: true, status: true } });
    if (order?.status !== "AWAITING_PAYMENT") {
      // Paid, but the order was given up meanwhile: money taken for nothing. Loud, so staff refund it.
      this.logger.error(`Card payment ${paymentId} approved for ${order?.reference ?? "a missing order"} which is ${order?.status ?? "gone"}: refund needed`);
      await this.prisma.payment.updateMany({ where: { id: paymentId, restaurantId }, data: { message: `Approved after the order was ${order?.status?.toLowerCase() ?? "removed"}: refund the customer` } });
      return payment;
    }
    await this.status.transition({
      restaurantId, orderId: order.id, to: "PENDING", actor: "SYSTEM", reason: "Paid by card",
      meta: { paymentId, providerRef: result.providerRef ?? null },
    });
    void this.printing.enqueueForOrder(restaurantId, order.id, true).catch(() => undefined);
    this.logger.log(`${order.reference} paid by card`);
    return payment;
  }

  /** The order leaves the payment screen without a card payment (the customer pays cash): it goes on to unTill. */
  async moveOn(restaurantId: string, orderId: string, reason: string) {
    await this.status.transition({ restaurantId, orderId, to: "PENDING", actor: "KIOSK", reason });
  }

  /** The customer stopped at the TPE screen. */
  async cancel(restaurantId: string, orderId: string) {
    const waiting = await this.prisma.payment.findMany({ where: { restaurantId, orderId, status: "PENDING" }, include: { terminal: true } });
    for (const p of waiting) {
      await this.prisma.payment.updateMany({ where: { id: p.id, restaurantId, status: "PENDING" }, data: { status: "CANCELLED", message: "Stopped by the customer", completedAt: new Date() } });
      if (p.terminal) await providerFor(p.terminal.provider)?.cancel({ paymentId: p.id, terminal: p.terminal }).catch(() => undefined);
    }
  }

  /** The kiosk's test buttons, for a payment on the simulator only, and only where the simulator is allowed. */
  async simulate(restaurantId: string, orderId: string, approve: boolean) {
    if (!simulatorAllowed()) throw new ForbiddenException("The payment simulator is not available on this server");
    const p = await this.prisma.payment.findFirst({ where: { restaurantId, orderId, status: "PENDING", provider: "SIMULATOR" } });
    if (!p) throw new ConflictException("No simulated payment is waiting");
    return this.complete(restaurantId, p.id, approve
      ? { approved: true, providerRef: `SIM-${Date.now().toString(36).toUpperCase()}` }
      : { approved: false, message: "Declined (simulator)" });
  }

  /** The latest attempt, for the kiosk's screen. */
  latest(restaurantId: string, orderId: string) {
    return this.prisma.payment.findFirst({ where: { restaurantId, orderId }, orderBy: { createdAt: "desc" } });
  }

  /** TPEs that never answered fail; orders nobody came back to are cancelled. */
  async expire(now = Date.now()) {
    const stale = await this.prisma.payment.findMany({
      where: { status: "PENDING", createdAt: { lt: new Date(now - PAYMENT_TIMEOUT_MS) } },
      include: { terminal: true }, take: 50,
    });
    for (const p of stale) {
      await this.prisma.payment.updateMany({ where: { id: p.id, restaurantId: p.restaurantId, status: "PENDING" }, data: { status: "FAILED", message: "The card terminal did not answer in time", completedAt: new Date(now) } });
      if (p.terminal) await providerFor(p.terminal.provider)?.cancel({ paymentId: p.id, terminal: p.terminal }).catch(() => undefined);
    }
    const abandoned = await this.prisma.order.findMany({
      where: { status: "AWAITING_PAYMENT", updatedAt: { lt: new Date(now - ABANDONED_ORDER_MS) }, payments: { none: { status: "PENDING" } } },
      select: { id: true, restaurantId: true }, take: 50,
    });
    for (const o of abandoned) {
      await this.status.transition({ restaurantId: o.restaurantId, orderId: o.id, to: "CANCELLED", actor: "SYSTEM", reason: "Not paid: left at the payment screen" }).catch(() => undefined);
    }
  }

  static assertMethod(available: boolean, which: string) {
    if (!available) throw new BadRequestException(`${which} payment is not available on this kiosk`);
  }
}
