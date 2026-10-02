import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Prisma, type Printer } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { pickLocalized } from "../common/locale.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { SavePrinterDto } from "./dto.js";
import { readPrinterConfig, type PrinterConfig } from "./printer-config.js";
import { buildTicket, type TicketData } from "./ticket.js";

const MAX_ATTEMPTS = 5;
/** A job the helper claimed but never answered is handed out again after this long. */
const CLAIM_TIMEOUT_SEC = 60;
/** While a helper waits, look again this often in case another API instance queued the ticket. */
const RECHECK_MS = 3000;
/** The helper polls every couple of seconds; silence for longer than this means offline. */
const HELPER_ONLINE_SEC = 40;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** The parts of an order the ticket needs. Prisma's Decimal columns are read with Number(). */
export interface LoadedOrder {
  id: string;
  restaurantId: string;
  /** The borne that took the order, if the restaurant has bornes. */
  kioskId?: string | null;
  reference: string;
  orderType: string;
  tableNumber: number | null;
  total: unknown;
  currency: string;
  createdAt: Date;
  items: {
    lineNumber: number;
    parentLineNumber: number | null;
    kind: string;
    articleId: bigint | null;
    articleName: string;
    quantity: number;
    unitPrice: unknown;
    lineTotal: unknown;
  }[];
}

/** What the back office shows about a printer: its settings, whether its helper is alive, and the last problem. */
export function summarizePrinter(p: Printer | null, now = Date.now()) {
  const config = readPrinterConfig(p?.config);
  if (!p) return { configured: false as const, config };
  const online = Boolean(p.lastSeenAt && now - p.lastSeenAt.getTime() < HELPER_ONLINE_SEC * 1000);
  return {
    configured: true as const,
    name: p.name,
    address: p.address,
    port: p.port,
    isEnabled: p.isEnabled,
    config,
    helper: { tokenIssuedAt: p.helperTokenIssuedAt, online, lastSeenAt: p.lastSeenAt },
    lastError: p.lastErrorMessage ? { message: p.lastErrorMessage, at: p.lastErrorAt } : null,
  };
}

const ORDER_TYPE_FR: Record<string, string> = { EAT_IN: "Sur place", TAKE_AWAY: "À emporter", DELIVERY: "Livraison" };

@Injectable()
export class PrintingService {
  private readonly logger = new Logger(PrintingService.name);

  /** How often a waiting helper looks again on its own. A field, so a test can shorten it. */
  protected recheckMs = RECHECK_MS;

  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------- settings

  /**
   * A borne's printer is the one linked to it (at most one). The restaurant's default printer is the one linked to no
   * borne: it prints for orders that came from no borne, and stands in for a borne that has no working printer.
   */
  private findPrinter(restaurantId: string, kioskId: string | null = null) {
    return this.prisma.printer.findFirst({
      where: { restaurantId, kioskId, kind: "RECEIPT", connection: "NETWORK" },
      orderBy: { createdAt: "asc" },
    });
  }

  async get(restaurantId: string, kioskId: string | null = null) {
    return summarizePrinter(await this.findPrinter(restaurantId, kioskId));
  }

  async save(restaurantId: string, dto: SavePrinterDto, kioskId: string | null = null) {
    const existing = await this.findPrinter(restaurantId, kioskId);
    const config: PrinterConfig = readPrinterConfig({
      ...readPrinterConfig(existing?.config),
      ...(dto.autoPrint !== undefined ? { autoPrint: dto.autoPrint } : {}),
      ...(dto.copies !== undefined ? { copies: dto.copies } : {}),
      ...(dto.cut !== undefined ? { cut: dto.cut } : {}),
      ...(dto.codepage !== undefined ? { codepage: dto.codepage } : {}),
    });
    const data = {
      name: dto.name.trim(),
      address: dto.address.trim(),
      port: dto.port,
      isEnabled: dto.isEnabled,
      config: config as unknown as Prisma.InputJsonValue,
    };
    if (existing) {
      // Scoped by the restaurant id as well as the printer id.
      await this.prisma.printer.updateMany({ where: { id: existing.id, restaurantId }, data });
    } else {
      await this.prisma.printer.create({ data: { ...data, restaurantId, kioskId, kind: "RECEIPT", connection: "NETWORK" } });
    }
    return this.get(restaurantId, kioskId);
  }

  /** The secret the helper signs in with. Shown once; only its hash is kept. */
  async issueToken(restaurantId: string, kioskId: string | null = null) {
    const printer = await this.findPrinter(restaurantId, kioskId);
    if (!printer) throw new BadRequestException("Save the printer's address first, then generate the helper token.");
    const token = `pht_${randomBytes(32).toString("base64url")}`;
    await this.prisma.printer.updateMany({
      where: { id: printer.id, restaurantId },
      data: { helperTokenHash: sha256(token), helperTokenIssuedAt: new Date() },
    });
    return { token };
  }

  /** `kioskId` undefined: every ticket of the restaurant. null: the default printer's. An id: that borne's. */
  listJobs(restaurantId: string, limit = 20, kioskId?: string | null) {
    return this.prisma.printJob.findMany({
      where: { restaurantId, ...(kioskId !== undefined ? { printer: { kioskId } } : {}) },
      orderBy: { createdAt: "desc" },
      take: Math.min(50, Math.max(1, limit)),
      select: {
        id: true, kind: true, status: true, attempts: true, lastError: true,
        createdAt: true, printedAt: true, order: { select: { id: true, reference: true } },
      },
    });
  }

  // ------------------------------------------------------------------- jobs

  private async enqueue(printer: Printer, kind: "TICKET" | "TEST", orderId: string | null, data: TicketData) {
    const cfg = readPrinterConfig(printer.config);
    const one = buildTicket(data, { columns: 48, codepage: cfg.codepage, cut: cfg.cut });
    // Copies are repeated in the payload, so the helper never has to think about them.
    const payload = Buffer.concat(Array.from({ length: cfg.copies }, () => one));
    const job = await this.prisma.printJob.create({
      data: { restaurantId: printer.restaurantId, printerId: printer.id, orderId, kind, payload, copies: cfg.copies },
      select: { id: true, status: true },
    });
    // A helper may be holding a request open, waiting for exactly this. Wake it now.
    this.wake(printer.id);
    return job;
  }

  async enqueueTest(restaurantId: string, kioskId: string | null = null) {
    const [printer, kiosk] = await Promise.all([
      this.findPrinter(restaurantId, kioskId),
      kioskId ? this.prisma.kiosk.findFirst({ where: { id: kioskId, restaurantId }, select: { name: true } }) : null,
    ]);
    if (!printer) throw new BadRequestException("Save the printer's address first.");
    const restaurant = await this.prisma.restaurant.findUniqueOrThrow({
      where: { id: restaurantId }, select: { name: true, timezone: true, settings: { select: { ticketFooterText: true } } },
    });
    return this.enqueue(printer, "TEST", null, {
      restaurantName: restaurant.name,
      reference: "TEST",
      printedAt: formatLocal(new Date(), restaurant.timezone),
      orderType: "Ticket de test",
      borneName: kiosk?.name ?? null,
      headline: "VOTRE NUMÉRO DE COMMANDE",
      bigText: "123",
      lines: [
        { quantity: 1, name: "Article de test", total: 12.5, modifiers: [{ name: "Option", price: 1 }] },
        { quantity: 2, name: "Accents : é è à ç ô ù œ €", total: 8, modifiers: [] },
      ],
      total: 20.5,
      currency: "MAD",
      payNote: "Si vous lisez ceci, l'imprimante fonctionne.",
      footer: restaurant.settings?.ticketFooterText ?? null,
    });
  }

  /**
   * Queues the customer's ticket for an order. `automatic` is the kiosk placing an order:
   * it does nothing unless the printer is on and set to print by itself. A reprint from the
   * back office always prints. Never throws for the automatic path: the order matters more.
   *
   * `loaded` is the order the caller already has in memory (the kiosk has just created it), which
   * saves a database round trip. Everything else is fetched at the same time, not one after another:
   * this is what stands between the customer tapping Confirm and the paper coming out.
   */
  async enqueueForOrder(restaurantId: string, orderId: string, automatic: boolean, loaded?: LoadedOrder) {
    try {
      const orderP = loaded ? this.scoped(loaded, restaurantId) : this.loadOrder(restaurantId, orderId);
      const namesP = orderP.then((o) => this.frenchNames(restaurantId, o));
      namesP.catch(() => undefined); // if we return early, a later failure here must not go unhandled
      const restaurantP = this.prisma.restaurant.findUniqueOrThrow({
        where: { id: restaurantId },
        select: { name: true, timezone: true, settings: { select: { ticketFooterText: true, askTableForEatIn: true } } },
      });
      // Which printer? The borne's own, or the restaurant's default when the borne has none that is switched on. When the
      // caller already has the order (the kiosk has just created it) the borne is known at once and everything is fetched
      // together; for a reprint the order has to be read first.
      const printersFor = (kioskId: string | null) =>
        Promise.all([
          kioskId ? this.findPrinter(restaurantId, kioskId) : null,
          this.findPrinter(restaurantId, null),
          kioskId ? this.prisma.kiosk.findFirst({ where: { id: kioskId, restaurantId }, select: { name: true } }) : null,
        ]);
      const early = loaded ? printersFor(loaded.kioskId ?? null) : null;
      early?.catch(() => undefined);
      const [order, restaurant] = await Promise.all([orderP, restaurantP]);
      const [bornePrinter, defaultPrinter, kiosk] = await (early ?? printersFor(order.kioskId ?? null));
      const printer = bornePrinter?.isEnabled ? bornePrinter : defaultPrinter;
      if (order.kioskId && printer === defaultPrinter && printer) {
        this.logger.warn(`Order ${order.reference}: its borne has no printer switched on, so the ticket goes to the restaurant's default printer`);
      }

      if (!printer || !printer.isEnabled) {
        if (automatic) return null;
        throw new BadRequestException("No printer is set up and switched on for this restaurant.");
      }
      if (automatic && !readPrinterConfig(printer.config).autoPrint) return null;

      const data = { ...this.ticketData(order, restaurant, await namesP), borneName: kiosk?.name ?? null };
      return await this.enqueue(printer, "TICKET", orderId, data);
    } catch (e) {
      if (!automatic) throw e;
      this.logger.warn(`Could not queue the ticket for order ${orderId}: ${String(e)}`);
      return null;
    }
  }

  /** An order handed in by the caller is only trusted for the restaurant it belongs to. */
  private async scoped(order: LoadedOrder, restaurantId: string): Promise<LoadedOrder> {
    if (order.restaurantId !== restaurantId) throw new NotFoundException("Order not found");
    return order;
  }

  private async loadOrder(restaurantId: string, orderId: string): Promise<LoadedOrder> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, restaurantId },
      include: { items: { orderBy: [{ lineNumber: "asc" }] } },
    });
    if (!order) throw new NotFoundException("Order not found");
    return order as unknown as LoadedOrder;
  }

  /** The ticket is in French whatever language the customer used on screen. */
  private async frenchNames(restaurantId: string, order: LoadedOrder): Promise<Map<string, string | null>> {
    const articleIds = order.items.filter((i) => i.kind === "PRODUCT" && i.articleId !== null).map((i) => i.articleId as bigint);
    if (articleIds.length === 0) return new Map();
    const presentations = await this.prisma.productPresentation.findMany({
      where: { restaurantId, articleId: { in: articleIds } },
      select: { articleId: true, displayName: true },
    });
    return new Map(presentations.map((p) => [p.articleId.toString(), pickLocalized(p.displayName, "fr", null)]));
  }

  /** The French ticket for an order, built from what was stored, not from today's catalog. */
  private ticketData(
    order: LoadedOrder,
    restaurant: { name: string; timezone: string; settings: { ticketFooterText: string | null; askTableForEatIn: boolean } | null },
    frName: Map<string, string | null>,
  ): TicketData {
    // An order straight from creation does not promise its lines are in order.
    const items = [...order.items].sort((x, y) => x.lineNumber - y.lineNumber);
    const lines = items
      .filter((i) => i.parentLineNumber === null)
      .map((product) => {
        const mods = items.filter((i) => i.parentLineNumber === product.lineNumber);
        return {
          quantity: product.quantity,
          name: (product.articleId !== null && frName.get(product.articleId.toString())) || product.articleName,
          total: Number(product.lineTotal) + mods.reduce((sum, m) => sum + Number(m.lineTotal), 0),
          modifiers: mods.map((m) => ({ name: m.articleName, price: Number(m.unitPrice) })),
        };
      });

    // The same rule as the kiosk's ticket screen: a customer who typed their table keeps the
    // order number; everyone else is told to put the stand number on their table.
    const askedForTable = order.orderType === "EAT_IN" && (restaurant.settings?.askTableForEatIn ?? true);
    const label = ORDER_TYPE_FR[order.orderType] ?? order.orderType;
    return {
      restaurantName: restaurant.name,
      reference: order.reference,
      printedAt: formatLocal(order.createdAt, restaurant.timezone),
      orderType: askedForTable && order.tableNumber ? `${label} - Table ${order.tableNumber}` : label,
      headline: askedForTable ? "VOTRE NUMÉRO DE COMMANDE" : "POSEZ CE NUMÉRO SUR VOTRE TABLE",
      bigText: askedForTable || order.tableNumber === null ? order.reference : String(order.tableNumber),
      lines,
      total: Number(order.total),
      currency: order.currency,
      payNote: "Présentez ce numéro en caisse pour payer",
      footer: restaurant.settings?.ticketFooterText ?? null,
    };
  }

  // ------------------------------------------------------- the print helper

  /** Finds the printer a helper token belongs to, or null. */
  authenticate(token: string): Promise<Printer | null> {
    return this.prisma.printer.findUnique({ where: { helperTokenHash: sha256(token) } });
  }

  /** Helpers that are holding a request open waiting for a ticket, by printer. */
  private readonly waiters = new Map<string, Set<() => void>>();

  /** A ticket was just queued for this printer: let any waiting helper look right away. */
  private wake(printerId: string) {
    for (const resume of [...(this.waiters.get(printerId) ?? [])]) resume();
  }

  private waitForJob(printerId: string, ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      const set = this.waiters.get(printerId) ?? new Set<() => void>();
      this.waiters.set(printerId, set);
      const resume = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", resume);
        set.delete(resume);
        if (set.size === 0) this.waiters.delete(printerId);
        resolve();
      };
      const timer = setTimeout(resume, ms);
      set.add(resume);
      signal?.addEventListener("abort", resume, { once: true });
    });
  }

  /**
   * The helper asks for work. Being asked at all shows it is alive, and its printer is marked
   * online. Returns the oldest job that is due, claimed atomically so two helpers (or a repeated
   * request) can never print the same ticket.
   *
   * With `waitMs` the request is held open until a ticket arrives or the time is up, instead of
   * answering "nothing" at once. A ticket queued on this server wakes the request immediately, so
   * paper comes out right after the customer confirms, not at the next poll. It also looks again
   * every few seconds, in case the ticket was queued by another instance of the API.
   */
  async next(printer: Printer, waitMs = 0, signal?: AbortSignal) {
    // Being asked is the sign of life. It is written at most every few seconds: a helper asks
    // constantly and this is not worth a query each time.
    let lastBeat = printer.lastSeenAt?.getTime() ?? 0;
    const pulse = async () => {
      if (Date.now() - lastBeat <= 5000) return;
      lastBeat = Date.now();
      await this.prisma.printer.updateMany({
        where: { id: printer.id, restaurantId: printer.restaurantId },
        data: { lastSeenAt: new Date(), status: printer.isEnabled ? "ONLINE" : "DISABLED" },
      });
    };

    await pulse();
    if (!printer.isEnabled) return { job: null };

    let job = await this.claim(printer);
    const deadline = Date.now() + waitMs;
    while (!job && !signal?.aborted && Date.now() < deadline) {
      await this.waitForJob(printer.id, Math.min(this.recheckMs, deadline - Date.now()), signal);
      if (signal?.aborted) break;
      await pulse();
      job = await this.claim(printer);
    }
    return { job };
  }

  /** One statement: expire a dead claim, then take the oldest job that is due. */
  private async claim(printer: Printer) {
    // FOR UPDATE SKIP LOCKED means two requests can never take the same job.
    const rows = await this.prisma.$queryRaw<{ id: string; payload: Buffer; attempts: number }[]>`
      WITH expired AS (
        UPDATE print_jobs SET status = 'FAILED', "lastError" = 'The print helper stopped answering'
        WHERE "printerId" = ${printer.id}::uuid AND "restaurantId" = ${printer.restaurantId}::uuid
          AND status = 'PRINTING' AND attempts >= ${MAX_ATTEMPTS}
          AND "claimedAt" < now() - make_interval(secs => ${CLAIM_TIMEOUT_SEC})
        RETURNING id
      ), claimed AS (
        UPDATE print_jobs SET status = 'PRINTING', "claimedAt" = now(), attempts = attempts + 1
        WHERE id = (
          SELECT id FROM print_jobs
          WHERE "printerId" = ${printer.id}::uuid AND "restaurantId" = ${printer.restaurantId}::uuid
            AND ( (status = 'QUEUED' AND ("nextAttemptAt" IS NULL OR "nextAttemptAt" <= now()))
               OR (status = 'PRINTING' AND attempts < ${MAX_ATTEMPTS}
                   AND "claimedAt" < now() - make_interval(secs => ${CLAIM_TIMEOUT_SEC})) )
          ORDER BY "createdAt" ASC LIMIT 1
          FOR UPDATE SKIP LOCKED)
        RETURNING id, payload, attempts
      )
      SELECT id, payload, attempts FROM claimed`;
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      host: printer.address,
      port: printer.port ?? 9100,
      attempt: row.attempts,
      dataBase64: Buffer.from(row.payload).toString("base64"),
    };
  }

  /** The helper says how the job went. Only a job of this printer can be answered. */
  async report(printer: Printer, jobId: string, ok: boolean, error?: string) {
    const job = await this.prisma.printJob.findFirst({
      where: { id: jobId, printerId: printer.id, restaurantId: printer.restaurantId },
      select: { id: true, attempts: true, status: true },
    });
    if (!job) throw new NotFoundException("No such print job for this printer");
    if (job.status !== "PRINTING") return { status: job.status }; // a late or repeated answer changes nothing

    const message = (error ?? "Unknown printer error").slice(0, 500);
    if (ok) {
      await this.prisma.printJob.updateMany({
        where: { id: job.id, printerId: printer.id },
        data: { status: "PRINTED", printedAt: new Date(), lastError: null },
      });
      await this.prisma.printer.updateMany({
        where: { id: printer.id, restaurantId: printer.restaurantId },
        data: { lastErrorMessage: null, lastErrorAt: null },
      });
      return { status: "PRINTED" as const };
    }

    const giveUp = job.attempts >= MAX_ATTEMPTS;
    await this.prisma.printJob.updateMany({
      where: { id: job.id, printerId: printer.id },
      data: {
        status: giveUp ? "FAILED" : "QUEUED",
        lastError: message,
        // 10s, 20s, 30s... so a printer that is switched off is not hammered.
        nextAttemptAt: giveUp ? null : new Date(Date.now() + job.attempts * 10_000),
      },
    });
    await this.prisma.printer.updateMany({
      where: { id: printer.id, restaurantId: printer.restaurantId },
      data: { lastErrorMessage: message, lastErrorAt: new Date() },
    });
    return { status: giveUp ? ("FAILED" as const) : ("QUEUED" as const) };
  }
}

/** "30/09/26 14:32" in the restaurant's own time zone. */
function formatLocal(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone, day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")}`;
}
