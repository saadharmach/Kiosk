import { Injectable, NotFoundException } from "@nestjs/common";
import { standing, todayIn, ymd } from "../common/subscription.js";
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
        status: true, logoPath: true, timezone: true,
        subscriptionPeriods: { select: { id: true, startsOn: true, endsOn: true, cancelledAt: true } },
        settings: { select: { eatInEnabled: true, takeAwayEnabled: true, deliveryEnabled: true, askTableForEatIn: true } },
        tpapi: { select: { isEnabled: true, credentialsCiphertext: true, lastSuccessAt: true, lastFailureAt: true, lastErrorMessage: true, lastSyncAt: true } },
      },
    });
    if (!restaurant) throw new NotFoundException("Restaurant not found");

    const [departments, articles, prices, salesAreas, mappings, owners, printers, kiosks, placedOrders, shownRows] = await Promise.all([
      this.prisma.tpapiDepartment.count({ where: { restaurantId } }),
      this.prisma.tpapiArticle.count({ where: { restaurantId, isActive: true, isPresent: true } }),
      this.prisma.tpapiArticlePrice.count({ where: { restaurantId } }),
      this.prisma.tpapiSalesArea.findMany({ where: { restaurantId }, select: { untillId: true, tableRanges: true } }),
      this.prisma.orderTypeMapping.findMany({ where: { restaurantId, isEnabled: true } }),
      this.prisma.restaurantUser.count({ where: { restaurantId, isActive: true, role: "OWNER" } }),
      this.prisma.printer.findMany({
        where: { restaurantId },
        orderBy: { createdAt: "asc" },
        select: { kioskId: true, isEnabled: true, address: true, helperTokenHash: true, lastSeenAt: true },
      }),
      this.prisma.kiosk.findMany({ where: { restaurantId, isEnabled: true }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } }),
      this.prisma.order.count({ where: { restaurantId, status: { in: ["CONFIRMED", "PAID"] } } }),
      this.prisma.productPresentation.findMany({ where: { restaurantId, isVisible: true }, select: { articleId: true } }),
    ]);
    // Shown and still on the menu (a product unTill retired may keep its old row).
    const onMenu = new Set((await this.prisma.tpapiArticle.findMany({ where: { restaurantId, isActive: true, isPresent: true }, select: { untillId: true } })).map((a) => a.untillId.toString()));
    const shown = shownRows.filter((r) => onMenu.has(r.articleId.toString())).length;

    const s = restaurant.settings;
    const switchedOn = { EAT_IN: s?.eatInEnabled ?? true, TAKE_AWAY: s?.takeAwayEnabled ?? false, DELIVERY: s?.deliveryEnabled ?? false };
    const orderTypes = TYPES.filter((t) => switchedOn[t]).map((type) => {
      const mapping = mappings.find((m) => m.orderType === type);
      const area = mapping ? salesAreas.find((a) => a.untillId === mapping.salesAreaId) : undefined;
      const configured = isOrderTypeConfigured({ askTable: type === "EAT_IN" ? (s?.askTableForEatIn ?? true) : false, mapping, area });
      // Why it is not ready, so the checklist can say what to do.
      const reason = configured ? null : !mapping ? ("NO_AREA" as const) : !area ? ("AREA_GONE" as const) : ("NO_TABLES" as const);
      return { type, configured, reason };
    });

    const factsOf = (p: (typeof printers)[number] | null) => p ? {
      enabled: p.isEnabled, hasAddress: Boolean(p.address), helperIssued: Boolean(p.helperTokenHash),
      helperOnline: Boolean(p.lastSeenAt && now - p.lastSeenAt.getTime() < HELPER_ONLINE_SEC * 1000),
    } : null;

    const t = restaurant.tpapi;
    const facts: ReadinessFacts = {
      status: restaurant.status,
      subscription: (() => {
        const sub = standing(restaurant.subscriptionPeriods ?? [], todayIn(restaurant.timezone ?? "UTC", new Date(now)));
        return { state: sub.state, coveredUntil: sub.coveredUntil ? ymd(sub.coveredUntil) : null, daysLeft: sub.daysLeft };
      })(),
      till: t ? {
        isEnabled: t.isEnabled, hasCredentials: Boolean(t.credentialsCiphertext),
        lastSuccessAt: t.lastSuccessAt, lastFailureAt: t.lastFailureAt, lastErrorMessage: t.lastErrorMessage, lastSyncAt: t.lastSyncAt,
      } : null,
      menu: { departments, articles, prices, shown },
      orderTypes,
      activeOwners: owners,
      printer: factsOf(printers.find((p) => p.kioskId === null) ?? null),
      bornes: kiosks.map((k) => ({ name: k.name, printer: factsOf(printers.find((p) => p.kioskId === k.id) ?? null) })),
      hasLogo: Boolean(restaurant.logoPath),
      placedOrders,
    };
    return evaluateReadiness(facts, now);
  }
}
