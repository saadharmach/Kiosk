import { ConflictException, Injectable, Logger, Optional } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { TpapiClientFactory } from "../common/tpapi-client.factory.js";

/**
 * A chevalet (the numbered stand the customer puts on their table) is taken while unTill has an open bill on its
 * table number, in the table part kiosk orders go to (set per order type, "a" if none). unTill puts every order on
 * the same table part onto one bill, so a second customer typing the same number would see their order vanish into
 * the first one's. A bill the cashier opened on another part of that table (12 a, when the kiosk uses 12 b) does not
 * count. The number is free again once the till closes that bill.
 */

export const TABLE_TAKEN = "TABLE_TAKEN";

export const tableTaken = (tableNumber: number) =>
  new ConflictException({ code: TABLE_TAKEN, message: `Chevalet ${tableNumber} is already in use`, tableNumber });

/** Kiosk orders unTill does not have yet: waiting for the card, or queued to be sent. */
const NOT_IN_TILL_YET = ["AWAITING_PAYMENT", "PENDING"] as const;
/** The part unTill uses when none is set: the table's first bill. */
const DEFAULT_TABLE_PART = "a";
const normPart = (p: unknown) => String(p ?? "").trim().toLowerCase() || DEFAULT_TABLE_PART;

/** Older ones are left-overs (a failed send, a lost payment), not a customer at a table. */
const IN_FLIGHT_MS = 2 * 60 * 60 * 1000;

type OrderReader = { order: { findFirst: (a: never) => Promise<{ reference: string } | null> } };

/** A kiosk order on this table number that has not reached unTill yet, if any. Works inside a transaction too. */
export function inFlightOnTable(db: OrderReader, restaurantId: string, tableNumber: number, now = Date.now()) {
  return db.order.findFirst({
    where: {
      restaurantId,
      tableNumber,
      status: { in: [...NOT_IN_TILL_YET] },
      createdAt: { gte: new Date(now - IN_FLIGHT_MS) },
    },
    select: { reference: true },
  } as never);
}

type ActiveOrders = { ReturnCode: number; ReturnMessage: string; Orders?: Record<string, unknown>[] };

@Injectable()
export class TableOccupancyService {
  private readonly logger = new Logger(TableOccupancyService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly clients?: TpapiClientFactory,
  ) {}

  /** The table part eat-in kiosk orders go to (the "Partie de table" of Sur place), "a" if none is set. */
  async kioskPart(restaurantId: string): Promise<string> {
    const mapping = await this.prisma.orderTypeMapping.findFirst({
      where: { restaurantId, orderType: "EAT_IN", isEnabled: true },
      select: { tablePart: true },
    });
    return normPart(mapping?.tablePart);
  }

  /**
   * Whether unTill has an open bill on this table number and part (GetActiveOrders). null: unTill could not be asked,
   * or did not answer properly; the order is then not held up (the till's own problems are reported elsewhere).
   */
  async openInTill(restaurantId: string, tableNumber: number, part: string): Promise<boolean | null> {
    if (!this.clients) return null;
    try {
      const { client } = await this.clients.forRestaurant(restaurantId, { timeoutMs: 8_000 });
      const res = await client.call<ActiveOrders>("GetActiveOrders", {}, { ignoreReturnCode: true, timeoutMs: 8_000 });
      if (res.ReturnCode !== 0) {
        this.logger.warn(`GetActiveOrders for table ${tableNumber}: ReturnCode ${res.ReturnCode} ${res.ReturnMessage ?? ""}`);
        return null;
      }
      return (res.Orders ?? []).some((o) => Number(o.TableNumber) === tableNumber && normPart(o.TablePart) === normPart(part));
    } catch (e) {
      this.logger.warn(`GetActiveOrders for table ${tableNumber} failed: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }

  /** Free unless a kiosk order on it is on its way to unTill, or unTill has a bill open on it in the kiosk's part. */
  async isFree(restaurantId: string, tableNumber: number): Promise<boolean> {
    if (await inFlightOnTable(this.prisma as never, restaurantId, tableNumber)) return false;
    return (await this.openInTill(restaurantId, tableNumber, await this.kioskPart(restaurantId))) !== true;
  }

  async assertFree(restaurantId: string, tableNumber: number) {
    if (!(await this.isFree(restaurantId, tableNumber))) throw tableTaken(tableNumber);
  }
}
