import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { summarizePrinter } from "../printing/printing.service.js";

/** More than this is a typo or a mistake, not a restaurant. */
export const MAX_BORNES = 20;

/** The next free "K1", "K2"... Codes are at most 4 characters and are used in order references. */
export function nextBorneCode(taken: Iterable<string>): string {
  const used = new Set([...taken].map((c) => c.toUpperCase()));
  for (let n = 1; n <= 99; n++) if (!used.has(`K${n}`)) return `K${n}`;
  throw new ConflictException("There are no more borne codes available");
}

/** The address a borne opens: the restaurant's kiosk with the borne's code, which the kiosk remembers. */
export function borneUrl(slug: string, code: string, env: NodeJS.ProcessEnv = process.env): string {
  return `${(env.KIOSK_APP_URL ?? "http://localhost:3002").replace(/\/+$/, "")}/r/${slug}?borne=${encodeURIComponent(code)}`;
}

/** A restaurant's bornes (kiosk machines). Every query and write carries the restaurant. */
@Injectable()
export class KiosksService {
  constructor(private readonly prisma: PrismaService) {}

  async list(restaurantId: string, slug: string) {
    const kiosks = await this.prisma.kiosk.findMany({ where: { restaurantId }, orderBy: { createdAt: "asc" } });
    const ids = kiosks.map((k) => k.id);
    const [printers, orders] = ids.length
      ? await Promise.all([
          this.prisma.printer.findMany({ where: { restaurantId, kioskId: { in: ids } } }),
          this.prisma.order.groupBy({ by: ["kioskId"], where: { restaurantId, kioskId: { in: ids } }, _count: { _all: true } }),
        ])
      : [[], []];
    const printerOf = new Map(printers.map((p) => [p.kioskId, p]));
    const ordersOf = new Map(orders.map((o) => [o.kioskId, o._count._all]));
    return kiosks.map((k) => ({
      id: k.id, code: k.code, name: k.name, isEnabled: k.isEnabled,
      url: borneUrl(slug, k.code),
      orders: ordersOf.get(k.id) ?? 0,
      printer: summarizePrinter(printerOf.get(k.id) ?? null),
    }));
  }

  async create(restaurantId: string, slug: string, name: string) {
    const clean = name.trim();
    if (!clean) throw new BadRequestException("Give the borne a name");
    // Two people adding at once can pick the same code: the unique index decides, and the loser tries the next one.
    for (let attempt = 0; attempt < 3; attempt++) {
      const existing = await this.prisma.kiosk.findMany({ where: { restaurantId }, select: { code: true } });
      if (existing.length >= MAX_BORNES) throw new ConflictException(`A restaurant can have at most ${MAX_BORNES} bornes`);
      try {
        const k = await this.prisma.kiosk.create({ data: { restaurantId, name: clean, code: nextBorneCode(existing.map((e) => e.code)) } });
        return { id: k.id, code: k.code, name: k.name, isEnabled: k.isEnabled, url: borneUrl(slug, k.code), orders: 0, printer: summarizePrinter(null) };
      } catch (e) {
        if ((e as { code?: string })?.code !== "P2002") throw e;
      }
    }
    throw new ConflictException("Could not pick a code for the borne. Try again.");
  }

  async update(restaurantId: string, id: string, dto: { name?: string; isEnabled?: boolean }) {
    await this.require(restaurantId, id);
    const name = dto.name?.trim();
    if (dto.name !== undefined && !name) throw new BadRequestException("Give the borne a name");
    await this.prisma.kiosk.updateMany({
      where: { id, restaurantId },
      data: { ...(name ? { name } : {}), ...(dto.isEnabled !== undefined ? { isEnabled: dto.isEnabled } : {}) },
    });
    return { id };
  }

  /**
   * Removes a borne that never took an order, together with its printer. A borne with orders can only be switched off:
   * its orders keep pointing at it. (Its printer is deleted explicitly: left alone it would turn into the restaurant's
   * default printer when the borne goes.)
   */
  async remove(restaurantId: string, id: string) {
    await this.require(restaurantId, id);
    if ((await this.prisma.order.count({ where: { restaurantId, kioskId: id } })) > 0) {
      throw new ConflictException("This borne has taken orders, so it cannot be deleted. Switch it off instead.");
    }
    await this.prisma.$transaction([
      this.prisma.printer.deleteMany({ where: { restaurantId, kioskId: id } }),
      this.prisma.kiosk.deleteMany({ where: { id, restaurantId } }),
    ]);
    return { removed: true };
  }

  /** Throws unless the borne belongs to this restaurant: a borne of another restaurant is "not found". */
  async require(restaurantId: string, id: string) {
    const k = await this.prisma.kiosk.findFirst({ where: { id, restaurantId }, select: { id: true, code: true, name: true, isEnabled: true } });
    if (!k) throw new NotFoundException("Borne not found");
    return k;
  }
}
