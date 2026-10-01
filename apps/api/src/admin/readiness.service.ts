import { Injectable, NotFoundException } from "@nestjs/common";
import { isOrderTypeConfigured } from "../common/order-type-config.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { evaluateReadiness, type ReadinessFacts } from "./readiness.js";

const HELPER_ONLINE_SEC = 40;   // the same window the back office uses to say "helper online"
const TYPES = ["EAT_IN", "TAKE_AWAY", "DELIVERY"] as const;

/** Gathers the facts for one restaurant (every query scoped by it) and asks the checklist what they mean. */
@Injectable()
export class ReadinessService {
  constructor(private readonly prisma: PrismaService) {}

  async get(restaurantId: string, now = Date.now()) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        status: true, logoPath: true,
        settings: { select: { eatInEnabled: true, takeAwayEnabled: true, deliveryEnabled: true, askTableForEatIn: true } },
        tpapi: { select: { isEnabled: true, credentialsCiphertext: true, lastSuccessAt: true, lastFailureAt: true, lastErrorMessage: true, lastSyncAt: true } },
      },
    });
    if (!restaurant) throw new NotFoundException("Restaurant not found");

    const [departments, articles, prices, salesAreas, mappings, owners, printer, placedOrders] = await Promise.all([
      this.prisma.tpapiDepartment.count({ where: { restaurantId } }),
      this.prisma.tpapiArticle.count({ where: { restaurantId, isActive: true, isPresent: true } }),
      this.prisma.tpapiArticlePrice.count({ where: { restaurantId } }),
      this.prisma.tpapiSalesArea.findMany({ where: { restaurantId }, select: { untillId: true, tableRanges: true } }),
      this.prisma.orderTypeMapping.findMany({ where: { restaurantId, isEnabled: true } }),
      this.prisma.restaurantUser.count({ where: { restaurantId, isActive: true, role: "OWNER" } }),
      this.prisma.printer.findFirst({
        where: { restaurantId },
        orderBy: { createdAt: "asc" },
        select: { isEnabled: true, address: true, helperTokenHash: true, lastSeenAt: true },
      }),
      this.prisma.order.count({ where: { restaurantId, status: { in: ["CONFIRMED", "PAID"] } } }),
    ]);

    const s = restaurant.settings;
    const switchedOn = { EAT_IN: s?.eatInEnabled ?? true, TAKE_AWAY: s?.takeAwayEnabled ?? false, DELIVERY: s?.deliveryEnabled ?? false };
    const orderTypes = TYPES.filter((t) => switchedOn[t]).map((type) => {
      const mapping = mappings.find((m) => m.orderType === type);
      const area = mapping ? salesAreas.find((a) => a.untillId === mapping.salesAreaId) : undefined;
      return { type, configured: isOrderTypeConfigured({ askTable: type === "EAT_IN" ? (s?.askTableForEatIn ?? true) : false, mapping, area }) };
    });

    const t = restaurant.tpapi;
    const facts: ReadinessFacts = {
      status: restaurant.status,
      till: t ? {
        isEnabled: t.isEnabled, hasCredentials: Boolean(t.credentialsCiphertext),
        lastSuccessAt: t.lastSuccessAt, lastFailureAt: t.lastFailureAt, lastErrorMessage: t.lastErrorMessage, lastSyncAt: t.lastSyncAt,
      } : null,
      menu: { departments, articles, prices },
      orderTypes,
      activeOwners: owners,
      printer: printer ? {
        enabled: printer.isEnabled, hasAddress: Boolean(printer.address), helperIssued: Boolean(printer.helperTokenHash),
        helperOnline: Boolean(printer.lastSeenAt && now - printer.lastSeenAt.getTime() < HELPER_ONLINE_SEC * 1000),
      } : null,
      hasLogo: Boolean(restaurant.logoPath),
      placedOrders,
    };
    return evaluateReadiness(facts, now);
  }
}
