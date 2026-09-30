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
/** The helper polls every couple of seconds; silence for longer than this means offline. */
const HELPER_ONLINE_SEC = 20;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

const ORDER_TYPE_FR: Record<string, string> = { EAT_IN: "Sur place", TAKE_AWAY: "À emporter", DELIVERY: "Livraison" };

@Injectable()
export class PrintingService {
  private readonly logger = new Logger(PrintingService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------- settings

  /** A restaurant has one ticket printer. */
  private findPrinter(restaurantId: string) {
    return this.prisma.printer.findFirst({
      where: { restaurantId, kind: "RECEIPT", connection: "NETWORK" },
      orderBy: { createdAt: "asc" },
    });
  }

  async get(restaurantId: string) {
    const p = await this.findPrinter(restaurantId);
    const config = readPrinterConfig(p?.config);
    if (!p) return { configured: false as const, config };
    const online = Boolean(p.lastSeenAt && Date.now() - p.lastSeenAt.getTime() < HELPER_ONLINE_SEC * 1000);
    return {
      configured: true as const,
      name: p.name,
      address: p.address,
      port: p.port,
      isEnabled: p.isEnabled,
      config,
      helper: {
        tokenIssuedAt: p.helperTokenIssuedAt,
        online,
        lastSeenAt: p.lastSeenAt,
      },
      lastError: p.lastErrorMessage ? { message: p.lastErrorMessage, at: p.lastErrorAt } : null,
    };
  }

  async save(restaurantId: string, dto: SavePrinterDto) {
    const existing = await this.findPrinter(restaurantId);
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
      await this.prisma.printer.create({ data: { ...data, restaurantId, kind: "RECEIPT", connection: "NETWORK" } });
    }
    return this.get(restaurantId);
  }

  /** The secret the helper signs in with. Shown once; only its hash is kept. */
  async issueToken(restaurantId: string) {
    const printer = await this.findPrinter(restaurantId);
    if (!printer) throw new BadRequestException("Save the printer's address first, then generate the helper token.");
    const token = `pht_${randomBytes(32).toString("base64url")}`;
    await this.prisma.printer.updateMany({
      where: { id: printer.id, restaurantId },
      data: { helperTokenHash: sha256(token), helperTokenIssuedAt: new Date() },
    });
    return { token };
  }

  listJobs(restaurantId: string, limit = 20) {
    return this.prisma.printJob.findMany({
      where: { restaurantId },
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
    return this.prisma.printJob.create({
      data: { restaurantId: printer.restaurantId, printerId: printer.id, orderId, kind, payload, copies: cfg.copies },
      select: { id: true, status: true },
    });
  }

  async enqueueTest(restaurantId: string) {
    const printer = await this.findPrinter(restaurantId);
    if (!printer) throw new BadRequestException("Save the printer's address first.");
    const restaurant = await this.prisma.restaurant.findUniqueOrThrow({
      where: { id: restaurantId }, select: { name: true, timezone: true, settings: { select: { ticketFooterText: true } } },
    });
    return this.enqueue(printer, "TEST", null, {
      restaurantName: restaurant.name,
      reference: "TEST",
      printedAt: formatLocal(new Date(), restaurant.timezone),
      orderType: "Ticket de test",
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
   */
  async enqueueForOrder(restaurantId: string, orderId: string, automatic: boolean) {
    try {
      const printer = await this.findPrinter(restaurantId);
      if (!printer || !printer.isEnabled) {
        if (automatic) return null;
        throw new BadRequestException("No printer is set up and switched on for this restaurant.");
      }
      if (automatic && !readPrinterConfig(printer.config).autoPrint) return null;
      const data = await this.ticketFor(restaurantId, orderId);
      return await this.enqueue(printer, "TICKET", orderId, data);
    } catch (e) {
      if (!automatic) throw e;
      this.logger.warn(`Could not queue the ticket for order ${orderId}: ${String(e)}`);
      return null;
    }
  }

  /** The French ticket for an order, built from what was stored, not from today's catalog. */
  private async ticketFor(restaurantId: string, orderId: string): Promise<TicketData> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, restaurantId },
      include: { items: { orderBy: [{ lineNumber: "asc" }] } },
    });
    if (!order) throw new NotFoundException("Order not found");
    const restaurant = await this.prisma.restaurant.findUniqueOrThrow({
      where: { id: restaurantId },
      select: { name: true, timezone: true, settings: { select: { ticketFooterText: true, askTableForEatIn: true } } },
    });

    // The ticket is in French whatever language the customer used on screen.
    const articleIds = order.items.filter((i) => i.kind === "PRODUCT" && i.articleId !== null).map((i) => i.articleId as bigint);
    const presentations = articleIds.length
      ? await this.prisma.productPresentation.findMany({
          where: { restaurantId, articleId: { in: articleIds } },
          select: { articleId: true, displayName: true },
        })
      : [];
    const frName = new Map(presentations.map((p) => [p.articleId.toString(), pickLocalized(p.displayName, "fr", null)]));

    const lines = order.items
      .filter((i) => i.parentLineNumber === null)
      .map((product) => {
        const mods = order.items.filter((i) => i.parentLineNumber === product.lineNumber);
        return {
          quantity: product.quantity,
          name: (product.articleId !== null && frName.get(product.articleId.toString())) || product.articleName,
          total: Number(product.lineTotal) + mods.reduce((s, m) => s + Number(m.lineTotal), 0),
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

  /**
   * The helper asks for work. Being asked at all shows it is alive, and its printer is
   * marked online. Returns the oldest job that is due, claimed atomically so two helpers
   * (or a repeated poll) can never print the same ticket.
   */
  async next(printer: Printer) {
    await this.prisma.printer.updateMany({
      where: { id: printer.id, restaurantId: printer.restaurantId },
      data: { lastSeenAt: new Date(), status: printer.isEnabled ? "ONLINE" : "DISABLED" },
    });
    if (!printer.isEnabled) return { job: null };

    // A claim nobody answered, and no attempts left, is a failure, not a retry.
    await this.prisma.$executeRaw`
      UPDATE print_jobs SET status = 'FAILED', "lastError" = 'The print helper stopped answering'
      WHERE "printerId" = ${printer.id}::uuid AND "restaurantId" = ${printer.restaurantId}::uuid
        AND status = 'PRINTING' AND attempts >= ${MAX_ATTEMPTS}
        AND "claimedAt" < now() - make_interval(secs => ${CLAIM_TIMEOUT_SEC})`;

    const rows = await this.prisma.$queryRaw<{ id: string; payload: Buffer; attempts: number }[]>`
      UPDATE print_jobs SET status = 'PRINTING', "claimedAt" = now(), attempts = attempts + 1
      WHERE id = (
        SELECT id FROM print_jobs
        WHERE "printerId" = ${printer.id}::uuid AND "restaurantId" = ${printer.restaurantId}::uuid
          AND ( (status = 'QUEUED' AND ("nextAttemptAt" IS NULL OR "nextAttemptAt" <= now()))
             OR (status = 'PRINTING' AND attempts < ${MAX_ATTEMPTS}
                 AND "claimedAt" < now() - make_interval(secs => ${CLAIM_TIMEOUT_SEC})) )
        ORDER BY "createdAt" ASC LIMIT 1
        FOR UPDATE SKIP LOCKED)
      RETURNING id, payload, attempts`;
    const job = rows[0];
    if (!job) return { job: null };
    return {
      job: {
        id: job.id,
        host: printer.address,
        port: printer.port ?? 9100,
        attempt: job.attempts,
        dataBase64: Buffer.from(job.payload).toString("base64"),
      },
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
