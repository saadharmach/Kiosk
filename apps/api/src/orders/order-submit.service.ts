import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service.js";
import { TpapiClientFactory } from "../common/tpapi-client.factory.js";
import { OrderStatusService } from "./order-status.service.js";

/** Confirmed by unTill, 2026-09-28. */
export const ORDER_ITEM_TYPE = {
  NORMAL: 0,
  MUST_HAVE: 1,
  FREE_OPTION: 2,
  SUPPLEMENT: 3,
  CONDIMENT: 4,
  MENU_COMPONENT: 5,
  FREE_TEXT: 6,
} as const;

const DEFAULT_TABLE_PART = "a";
const VALID_TABLE_PARTS = ["a", "b", "c", "d", "e", "f"];
/** After this many tries we stop retrying and make the failure visible. */
const MAX_ATTEMPTS = 5;
/** A SENT order older than this is left alone; staff can see it in the back office. */
const VERIFY_WINDOW_MS = 10 * 60 * 1000;
/**
 * unTill sometimes answers with a valid SOAP envelope carrying its own socket
 * failure. That is their infrastructure, not a verdict on the order.
 */
const RETRYABLE = /socket error|connection reset|connection refused|timed ?out|EIdSocketError|not available|is loading|is starting/i;

interface WireExtra {
  Key: string;
  Value: string;
  Extra: unknown[];
}

interface WireOrderItem {
  ItemNumber: number;
  ArticleId: number;
  OrderItemType: number;
  Text: string;
  ManualPrice: number;
  Quantity: number;
  Extra: WireExtra[];
}

type ActiveOrders = {
  ReturnCode: number;
  ReturnMessage: string;
  Orders?: Record<string, unknown>[];
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

@Injectable()
export class OrderSubmitService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrderSubmitService.name);
  private sweepTimer: NodeJS.Timeout | null = null;
  private sweeping = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly clients: TpapiClientFactory,
    private readonly status: OrderStatusService,
  ) {}

  onModuleInit() {
    const ms = Number(process.env.TPAPI_SWEEP_MS ?? 10_000);
    if (!ms) {
      this.logger.warn("Auto-submit sweep disabled: orders will only be sent manually");
      return;
    }
    this.sweepTimer = setInterval(() => void this.sweep(), ms);
    this.sweepTimer.unref?.();
    this.logger.log(`Auto-submit sweep every ${ms}ms`);
  }

  onModuleDestroy() {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

  /**
   * Sends orders the kiosk created and confirms the ones already sent.
   * The customer's ticket never waits on the till: ordering and submission
   * are deliberately separate.
   */
   async sweep() {
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      const toSend = await this.prisma.order.findMany({
        where: { status: "PENDING", tpapiAttempts: { lt: MAX_ATTEMPTS } },
        orderBy: { createdAt: "asc" },
        take: 20,
        select: {
          id: true,
          restaurantId: true,
          reference: true,
          tpapiAttempts: true,
          updatedAt: true,
        },
      });

      // A first attempt goes immediately; after that back off 30s, 60s, 90s…
      // An order the till chokes on must not monopolise it — while unTill is
      // restarting, every other restaurant's orders fail too.
      const now = Date.now();
      const ready = toSend.filter(
        (o) => o.tpapiAttempts === 0 || now - o.updatedAt.getTime() > o.tpapiAttempts * 30_000,
      );

      for (const o of ready) {
        try {
          await this.submit(o.restaurantId, o.id);
        } catch (e) {
          this.logger.warn(`Sweep: ${o.reference} not sent — ${(e as Error).message}`);
        }
      }

      const toVerify = await this.prisma.order.findMany({
        where: { status: "SENT", sentAt: { gte: new Date(Date.now() - VERIFY_WINDOW_MS) } },
        orderBy: { createdAt: "asc" },
        take: 20,
        select: { id: true, restaurantId: true, reference: true },
      });
      for (const o of toVerify) {
        try {
          await this.verify(o.restaurantId, o.id);
        } catch (e) {
          this.logger.warn(`Sweep verify: ${o.reference} — ${(e as Error).message}`);
        }
      }
    } finally {
      this.sweeping = false;
    }
  }

  /**
   * Sends one PENDING order to unTill as CreateOrder.
   * ManualPrice is always 0: unTill prices each line from the article and the
   * price level of the sales area the table belongs to, so the kiosk and the
   * till can never disagree about the bill.
   */
  async submit(restaurantId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, restaurantId },
      include: { items: { orderBy: { lineNumber: "asc" } } },
    });
    if (!order) throw new NotFoundException("Order not found");

    if (order.status !== "PENDING") {
      throw new BadRequestException(
        `Only a PENDING order can be submitted. ${order.reference} is ${order.status}.`,
      );
    }

    const tablePart = await this.resolveTablePart(restaurantId, order.orderType, order.tablePart);

        // Free-versus-chargeable is a property of the article↔group LINK, not of the
    // group: the same group can be free on one article and paid on another.
    const parentArticleIds = order.items
      .filter((i) => i.parentLineNumber === null && i.articleId !== null)
      .map((i) => i.articleId as bigint);

    const links = parentArticleIds.length
      ? await this.prisma.tpapiArticleOption.findMany({
          where: { restaurantId, articleId: { in: parentArticleIds } },
          select: { articleId: true, optionGroupId: true, isFreeOption: true },
        })
      : [];
    const freeLinks = new Set(
      links.filter((l) => l.isFreeOption).map((l) => `${l.articleId}:${l.optionGroupId}`),
    );

    const typeOf = (kind: string, parentArticleId: bigint, optionGroupId: bigint | null): number => {
      switch (kind) {
        case "MENU_CHOICE":
          return ORDER_ITEM_TYPE.MENU_COMPONENT;
        case "SUPPLEMENT":
          return ORDER_ITEM_TYPE.SUPPLEMENT;
        case "TEXT":
        case "REMOVAL":
          return ORDER_ITEM_TYPE.FREE_TEXT;
        default:
          return optionGroupId && freeLinks.has(`${parentArticleId}:${optionGroupId}`)
            ? ORDER_ITEM_TYPE.FREE_OPTION
            : ORDER_ITEM_TYPE.MUST_HAVE;
      }
    };

    // unTill reads parent/child from POSITION: a parent, then its own modifiers,
    // then the next parent. A size is not a line at all — it rides on the
    // parent's Extra as size_modifier_item_id.
    const parents = order.items.filter((i) => i.parentLineNumber === null);
    const items: WireOrderItem[] = [];
    let n = 0;

    for (const parent of parents) {
      if (parent.articleId === null) {
        throw new BadRequestException(
          `Line ${parent.lineNumber} of ${order.reference} has no articleId and cannot be sent.`,
        );
      }
      const children = order.items.filter((i) => i.parentLineNumber === parent.lineNumber);
      const size = children.find((c) => c.kind === "SIZE" && c.sizeItemId !== null);

      items.push({
        ItemNumber: ++n,
        ArticleId: Number(parent.articleId),
        OrderItemType: ORDER_ITEM_TYPE.NORMAL,
        Text: parent.text ?? "",
        ManualPrice: 0,
        Quantity: parent.quantity,
        Extra: size
          ? [{ Key: "size_modifier_item_id", Value: String(size.sizeItemId), Extra: [] }]
          : [],
      });

      for (const child of children) {
        if (child.kind === "SIZE") continue;
        const type = typeOf(child.kind, parent.articleId, child.optionGroupId);
        items.push({
          ItemNumber: ++n,
          ArticleId: type === ORDER_ITEM_TYPE.FREE_TEXT ? 0 : Number(child.articleId ?? 0),
          OrderItemType: type,
          Text: child.text ?? child.articleName ?? "",
          ManualPrice: 0,
          // Never the parent's quantity: unTill counts one modifier per parent line.
          Quantity: 1,
          Extra: [],
        });
      }
    }

    if (items.length === 0) {
      throw new BadRequestException(`Order ${order.reference} has no article lines.`);
    }

    const request = {
      TableNumber: order.tableNumber,
      TablePart: tablePart,
      ClientName: order.customerName ?? "",
      // The cashier finds the bill by this. It is the only link between kiosk and till.
      OrderName: order.reference,
      OrderDescr: "",
      Items: items,
      Covers: order.covers,
      Extra: [],
      ClientId: 0,
    };

    const correlationId = randomUUID();
    const started = Date.now();
    const { client } = await this.clients.forRestaurant(restaurantId);

    let returnCode: number | null = null;
    let returnMessage = "";
    let thrown: Error | null = null;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await client.call<{ ReturnCode: number; ReturnMessage: string }>(
          "CreateOrder",
          request,
          { ignoreReturnCode: true },
        );
        returnCode = typeof res.ReturnCode === "number" ? res.ReturnCode : null;
        returnMessage = res.ReturnMessage ?? "";
        thrown = null;
        break;
      } catch (e) {
        thrown = e instanceof Error ? e : new Error(String(e));
        this.logger.warn(
          `CreateOrder ${order.reference} attempt ${attempt}/3 failed: ${thrown.message}`,
        );
        if (attempt < 3) await sleep(attempt * 250);
      }
    }

    const durationMs = Date.now() - started;
    const ok = thrown === null && returnCode === 0;
    const errorText = thrown
      ? `${thrown.name}: ${thrown.message}`
      : ok
        ? null
        : `unTill returned ${returnCode}: ${returnMessage}`;

    await this.writeLog({
      restaurantId,
      orderId: order.id,
      operation: "CreateOrder",
      correlationId,
      ok,
      returnCode,
      durationMs,
      message: errorText ?? returnMessage,
      requestSummary: request,
    });

    const patch = {
      tpapiAttempts: { increment: 1 },
      tpapiCorrelationId: correlationId,
      tpapiReturnCode: returnCode,
      tpapiRequestSnapshot: request as never,
      tpapiLastError: errorText,
    };

    if (!ok) {
      const retryable = thrown !== null || RETRYABLE.test(returnMessage);
      const attempts = order.tpapiAttempts + 1;

      if (retryable && attempts < MAX_ATTEMPTS) {
        // Stay PENDING so the sweep tries again. No status change, no history noise.
        await this.prisma.order.update({ where: { id: order.id }, data: patch as never });
        throw new ServiceUnavailableException(errorText ?? "The till is unreachable");
      }

      await this.status.transition({
        restaurantId,
        orderId: order.id,
        to: "FAILED",
        actor: "SYSTEM",
        reason: errorText ?? "CreateOrder failed",
        meta: { correlationId, attempts },
        patch,
      });
      throw new BadRequestException(errorText ?? "CreateOrder failed");
    }

    const result = await this.status.transition({
      restaurantId,
      orderId: order.id,
      to: "SENT",
      actor: "SYSTEM",
      reason: "CreateOrder accepted",
      meta: { correlationId },
      patch,
    });

    this.logger.log(`Order ${order.reference} sent to unTill in ${durationMs}ms`);
    return { ...result, correlationId, durationMs };
  }

  /**
   * Confirms a SENT order really exists in unTill by finding our OrderName in
   * GetActiveOrders. unTill never reports this back to us, so we go and look.
   */
  async verify(restaurantId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, restaurantId },
      select: { id: true, reference: true, status: true },
    });
    if (!order) throw new NotFoundException("Order not found");
    if (order.status !== "SENT") {
      throw new BadRequestException(
        `Only a SENT order can be verified. ${order.reference} is ${order.status}.`,
      );
    }

    const correlationId = randomUUID();
    const started = Date.now();
    const { client } = await this.clients.forRestaurant(restaurantId);

    let res: ActiveOrders | null = null;
    let transportError: Error | null = null;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        res = await client.call<ActiveOrders>("GetActiveOrders", {}, { ignoreReturnCode: true });
        transportError = null;
        break;
      } catch (e) {
        transportError = e instanceof Error ? e : new Error(String(e));
        this.logger.warn(
          `GetActiveOrders ${order.reference} attempt ${attempt}/3: ${transportError.message}`,
        );
        if (attempt < 3) await sleep(attempt * 500);
      }
    }

    if (!res) {
      await this.writeLog({
        restaurantId,
        orderId: order.id,
        operation: "GetActiveOrders",
        correlationId,
        ok: false,
        returnCode: null,
        durationMs: Date.now() - started,
        message: `Verification unreachable: ${transportError?.message ?? "unknown"}`,
      });
      // The order stays SENT. unTill accepted it; we simply could not look.
      return { reference: order.reference, confirmed: false, unreachable: true };
    }

    const active = res.Orders ?? [];
    const found = active.some((o) => String(o.OrderName ?? "") === order.reference);

    if (!found && active.length > 0) {
      this.logger.warn(
        `${order.reference} not matched. First active order keys: ${Object.keys(active[0] ?? {}).join(", ")}`,
      );
    }

    await this.writeLog({
      restaurantId,
      orderId: order.id,
      operation: "GetActiveOrders",
      correlationId,
      ok: found,
      returnCode: 0,
      durationMs: Date.now() - started,
      message: found ? "Found in GetActiveOrders" : `Not found among ${active.length} active orders`,
      responseSummary: { activeCount: active.length, sample: active[0] ?? null },
    });

    if (!found) {
      return { reference: order.reference, confirmed: false, activeCount: active.length };
    }

    const result = await this.status.transition({
      restaurantId,
      orderId: order.id,
      to: "CONFIRMED",
      actor: "SYSTEM",
      reason: "Found in GetActiveOrders",
      meta: { correlationId },
    });
    return { ...result, confirmed: true };
  }

  private async resolveTablePart(
    restaurantId: string,
    orderType: string,
    stored: string,
  ): Promise<string> {
    if (stored) return this.checkPart(stored);
    const mapping = await this.prisma.orderTypeMapping.findFirst({
      where: { restaurantId, orderType: orderType as never },
      select: { tablePart: true },
    });
    // unTill rejects an empty TablePart. "a" is the primary bill for a table.
    return this.checkPart(mapping?.tablePart || DEFAULT_TABLE_PART);
  }

  private checkPart(part: string): string {
    const p = part.trim().toLowerCase();
    if (!VALID_TABLE_PARTS.includes(p)) {
      throw new BadRequestException(
        `Invalid tablePart "${part}". unTill accepts ${VALID_TABLE_PARTS.join(", ")}.`,
      );
    }
    return p;
  }

  private async writeLog(p: {
    restaurantId: string;
    orderId: string;
    operation: string;
    correlationId: string;
    ok: boolean;
    returnCode: number | null;
    durationMs: number;
    message: string | null;
    requestSummary?: unknown;
    responseSummary?: unknown;
  }) {
    try {
      await this.prisma.integrationLog.create({
        data: {
          restaurantId: p.restaurantId,
          orderId: p.orderId,
          operation: p.operation,
          correlationId: p.correlationId,
          ok: p.ok,
          returnCode: p.returnCode,
          durationMs: p.durationMs,
          message: p.message?.slice(0, 1000) ?? null,
          requestSummary: (p.requestSummary ?? null) as never,
          responseSummary: (p.responseSummary ?? null) as never,
        },
      });
    } catch (e) {
      this.logger.error(`Failed to write integration log: ${String(e)}`);
    }
  }
}