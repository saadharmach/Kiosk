import { Controller, Get, UseGuards } from "@nestjs/common";
import { todayIn, ymd } from "../common/subscription.js";
import { tillReachable } from "../common/till-health.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { RestaurantAuthGuard } from "../restaurant-auth/guards/restaurant-auth.guard.js";
import { TenantGuard } from "../restaurant-auth/guards/tenant.guard.js";
import { Tenant } from "../restaurant-auth/tenant.decorator.js";

interface TenantCtx { restaurantId: string; slug: string }

/** A registered borne asks for /version every 20 seconds: one that has not for two minutes is off line. */
export const ONLINE_WITHIN_MS = 2 * 60_000;
/** Orders that count as sold today: taken by the till (or paid). */
const SOLD = ["PENDING", "SENT", "CONFIRMED", "PAID"] as const;

/**
 * The back office's dashboard: only what the server really knows. A borne's state needs a registered screen (only a
 * registered screen says who it is), so bornes that are not registered are counted but have no state.
 */
@Controller("restaurant/:slug/dashboard")
@UseGuards(RestaurantAuthGuard, TenantGuard)
export class DashboardController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async get(@Tenant() t: TenantCtx) {
    const restaurantId = t.restaurantId;
    const r = await this.prisma.restaurant.findUniqueOrThrow({
      where: { id: restaurantId },
      select: { timezone: true, currency: true, tpapi: { select: { isEnabled: true, lastSyncAt: true, pingFailures: true } } },
    });
    const today = todayIn(r.timezone);
    const now = Date.now();

    const [kiosks, sold, recent, lastSync] = await Promise.all([
      this.prisma.kiosk.findMany({
        where: { restaurantId },
        orderBy: { code: "asc" },
        select: { code: true, name: true, isEnabled: true, tokenHash: true, tokenRevokedAt: true, lastHeartbeatAt: true },
      }),
      this.prisma.order.aggregate({
        where: { restaurantId, businessDate: today, status: { in: [...SOLD] } },
        _count: { _all: true },
        _sum: { total: true },
      }),
      this.prisma.order.findMany({
        where: { restaurantId, status: { not: "DRAFT" } },
        orderBy: { createdAt: "desc" },
        take: 6,
        select: { reference: true, status: true, total: true, orderType: true, createdAt: true },
      }),
      this.prisma.syncRun.findFirst({
        where: { restaurantId, finishedAt: { not: null } },
        orderBy: { startedAt: "desc" },
        select: { status: true, finishedAt: true, errorMessage: true },
      }),
    ]);

    const bornes = kiosks.map((k) => {
      const registered = Boolean(k.tokenHash) && !k.tokenRevokedAt;
      const online = registered && k.isEnabled && k.lastHeartbeatAt !== null && now - k.lastHeartbeatAt.getTime() < ONLINE_WITHIN_MS;
      return { code: k.code, name: k.name, enabled: k.isEnabled, registered, online, lastSeenAt: k.lastHeartbeatAt?.toISOString() ?? null };
    });
    const enabled = bornes.filter((b) => b.enabled);
    const known = enabled.filter((b) => b.registered);

    return {
      today: ymd(today),
      currency: r.currency,
      bornes: {
        configured: enabled.length,
        // null: no borne has a registered screen, so nobody can say which are on line.
        online: known.length > 0 ? known.filter((b) => b.online).length : null,
        offline: known.length > 0 ? known.filter((b) => !b.online).length : null,
        list: bornes,
      },
      orders: { count: sold._count._all, revenue: sold._sum.total?.toNumber() ?? 0 },
      till: r.tpapi?.isEnabled
        ? { reachable: tillReachable(r.tpapi), lastSyncAt: r.tpapi.lastSyncAt?.toISOString() ?? null }
        : null,
      lastSync: lastSync ? { status: lastSync.status, at: lastSync.finishedAt!.toISOString(), error: lastSync.errorMessage } : null,
      recentOrders: recent.map((o) => ({
        reference: o.reference, status: o.status, total: o.total.toNumber(), orderType: o.orderType, at: o.createdAt.toISOString(),
      })),
    };
  }
}
