import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
import { RestaurantAuthGuard } from "../restaurant-auth/guards/restaurant-auth.guard.js";
import { TenantGuard } from "../restaurant-auth/guards/tenant.guard.js";
import { Tenant } from "../restaurant-auth/tenant.decorator.js";
import { SettingsService } from "./settings.service.js";
import { UpdateSettingsDto } from "./dto/settings.dto.js";

interface TenantCtx { restaurantId: string; slug: string }

@Controller("restaurant/:slug/settings")
@UseGuards(RestaurantAuthGuard, TenantGuard)
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  get(@Tenant() tenant: TenantCtx) {
    return this.settings.get(tenant.restaurantId);
  }

  @Patch()
  update(@Tenant() tenant: TenantCtx, @Body() dto: UpdateSettingsDto) {
    return this.settings.update(tenant.restaurantId, dto);
  }
}