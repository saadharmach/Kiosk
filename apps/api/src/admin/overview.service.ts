import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { consecutiveFailures } from "../sync/sync-schedule.js";
import { STUCK_AFTER_MIN, buildAttention, type RestaurantFacts } from "./attention.js";

const MIN = 60_000;
const DAY = 86_400_000;
/** Orders that count as having been placed (not drafts, not abandoned or cancelled ones). */
const PLACED = ["PENDING", "SENT", "CONFIRMED", "PAID"] as const;

/** One screen for the platform team: how many restaurants, how busy, and what needs a look. */
@Injectable()
export class OverviewService {
  constructor(private readonly prisma: PrismaService) {}

  async get(now = Date.now()) {
    const since24h = new Date(now - DAY);
    const since7d = new Date(now - 7 * DAY);
    // Older than this and still "waiting" is leftover test data, not an order a customer is waiting for.
    const stuckBefore = new Date(now - STUCK_AFTER_MIN * MIN);

    const [restaurants, owners, stuck, failed, last24h, last7d, syncRuns, activity] = await Promise.all([
      this.prisma.restaurant.findMany({
        select: {
          id: true, slug: true, name: true, status: true,
          tpapi: { select: { isEnabled: true, lastSuccessAt: true, lastFailureAt: true, lastSyncAt: true, lastErrorMessage: true } },
        },
      }),
      this.prisma.restaurantUser.groupBy({ by: ["restaurantId"], where: { isActive: true, role: "OWNER" }, _count: { _all: true } }),
      this.prisma.order.groupBy({
        by: ["restaurantId"],
        where: { status: { in: ["PENDING", "SENT"] }, createdAt: { lt: stuckBefore, gte: new Date(now - 3 * DAY) } },
        _count: { _all: true },
      }),
      this.prisma.order.groupBy({ by: ["restaurantId"], where: { status: "FAILED", createdAt: { gte: since24h } }, _count: { _all: true } }),
      this.prisma.order.count({ where: { status: { in: [...PLACED] }, createdAt: { gte: since24h } } }),
      this.prisma.order.count({ where: { status: { in: [...PLACED] }, createdAt: { gte: since7d } } }),
      // The last day's menu syncs of every restaurant, newest first: enough to see who is failing.
      this.prisma.syncRun.findMany({
        where: { startedAt: { gte: since24h } },
        orderBy: { startedAt: "desc" }, take: 2000,
        select: { restaurantId: true, status: true, startedAt: true, errorMessage: true },
      }),
      this.prisma.auditLog.findMany({
        where: { restaurantId: { not: null } },
        orderBy: { createdAt: "desc" }, take: 8,
        select: { id: true, createdAt: true, restaurantId: true, actorType: true, actorId: true, actorLabel: true, action: true },
      }),
    ]);

    const count = (rows: { restaurantId: string; _count: { _all: number } }[]) => new Map(rows.map((r) => [r.restaurantId, r._count._all]));
    const ownersOf = count(owners), stuckOf = count(stuck), failedOf = count(failed);

    // Each restaurant's own syncs, newest first (the query is already newest first).
    const runsOf = new Map<string, typeof syncRuns>();
    for (const run of syncRuns) runsOf.set(run.restaurantId, [...(runsOf.get(run.restaurantId) ?? []), run]);

    const facts: RestaurantFacts[] = restaurants.map((r) => {
      const runs = runsOf.get(r.id) ?? [];
      const failures = consecutiveFailures(runs, now);
      return {
        ...r,
        activeOwners: ownersOf.get(r.id) ?? 0,
        stuckOrders: stuckOf.get(r.id) ?? 0,
        failedOrders: failedOf.get(r.id) ?? 0,
        syncFailures: failures,
        lastSyncError: failures > 0 ? (runs[0]?.errorMessage ?? null) : null,
      };
    });

    const byStatus = { ACTIVE: 0, SUSPENDED: 0, ARCHIVED: 0 };
    for (const r of restaurants) byStatus[r.status]++;

    const nameOf = new Map(restaurants.map((r) => [r.id, r.name]));
    const platformIds = [...new Set(activity.filter((a) => a.actorType === "PLATFORM_USER" && a.actorId).map((a) => a.actorId!))];
    const restaurantUserIds = [...new Set(activity.filter((a) => a.actorType === "RESTAURANT_USER" && a.actorId).map((a) => a.actorId!))];
    const [platformUsers, restaurantUsers] = await Promise.all([
      this.prisma.platformUser.findMany({ where: { id: { in: platformIds } }, select: { id: true, email: true } }),
      this.prisma.restaurantUser.findMany({ where: { id: { in: restaurantUserIds } }, select: { id: true, email: true } }),
    ]);
    const emailOf = new Map([...platformUsers, ...restaurantUsers].map((u) => [u.id, u.email]));

    return {
      generatedAt: new Date(now).toISOString(),
      restaurants: { ...byStatus, total: restaurants.length },
      orders: { last24h, last7d },
      attention: buildAttention(facts, now),
      recentActivity: activity.map((a) => ({
        id: a.id,
        at: a.createdAt,
        restaurantId: a.restaurantId,
        restaurant: (a.restaurantId ? nameOf.get(a.restaurantId) : undefined) ?? null,
        actor: (a.actorId ? emailOf.get(a.actorId) : undefined) ?? a.actorLabel ?? (a.actorType === "SYSTEM" ? "System" : null),
        action: a.action,
      })),
    };
  }
}
