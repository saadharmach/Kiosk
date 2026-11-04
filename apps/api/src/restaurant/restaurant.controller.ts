import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { RestaurantAuthGuard } from "../restaurant-auth/guards/restaurant-auth.guard.js";
import { TenantGuard } from "../restaurant-auth/guards/tenant.guard.js";
import { Tenant } from "../restaurant-auth/tenant.decorator.js";

@Controller("restaurant/:slug")
@UseGuards(RestaurantAuthGuard, TenantGuard)
export class RestaurantController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("summary")
  async summary(@Param("slug") _slug: string, @Tenant() tenant: { restaurantId: string; slug: string }) {
    // Note: the query uses the tenant from the TOKEN, never the URL parameter.
    const [orders, kiosks, users] = await Promise.all([
      this.prisma.order.count({ where: { restaurantId: tenant.restaurantId } }),
      this.prisma.kiosk.count({ where: { restaurantId: tenant.restaurantId } }),
      this.prisma.restaurantUser.count({ where: { restaurantId: tenant.restaurantId } }),
    ]);
    return { slug: tenant.slug, orders, kiosks, users };
  }
}