import { Controller, Get, UseGuards } from "@nestjs/common";
import { standing, todayIn, ymd } from "../common/subscription.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { RestaurantAuthGuard } from "../restaurant-auth/guards/restaurant-auth.guard.js";
import { TenantGuard } from "../restaurant-auth/guards/tenant.guard.js";
import { Tenant } from "../restaurant-auth/tenant.decorator.js";

interface TenantCtx { restaurantId: string; slug: string }

/** Where the restaurant's subscription stands, for the back office's banner. Dates only: never what was paid. */
@Controller("restaurant/:slug/subscription")
@UseGuards(RestaurantAuthGuard, TenantGuard)
export class RestaurantSubscriptionController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async get(@Tenant() t: TenantCtx) {
    const [r, periods] = await Promise.all([
      this.prisma.restaurant.findUniqueOrThrow({ where: { id: t.restaurantId }, select: { timezone: true, closeBackofficeWhenEnded: true } }),
      this.prisma.subscriptionPeriod.findMany({
        where: { restaurantId: t.restaurantId },
        select: { id: true, startsOn: true, endsOn: true, cancelledAt: true },
      }),
    ]);
    const s = standing(periods, todayIn(r.timezone));
    return {
      state: s.state,
      coveredUntil: s.coveredUntil ? ymd(s.coveredUntil) : null,
      daysLeft: s.daysLeft,
      next: s.next ? { startsOn: ymd(s.next.startsOn) } : null,
      // The back office closes when nothing runs: warned in the last days, signed out once it has ended.
      closesWhenEnded: r.closeBackofficeWhenEnded,
    };
  }
}
