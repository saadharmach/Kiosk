import { Body, Controller, Get, Param, ParseUUIDPipe, Put, UseGuards } from "@nestjs/common";
import { RestaurantAuthGuard } from "../restaurant-auth/guards/restaurant-auth.guard.js";
import { TenantGuard } from "../restaurant-auth/guards/tenant.guard.js";
import { Tenant } from "../restaurant-auth/tenant.decorator.js";
import { UpdatePaymentSettingsDto, UpdateTerminalDto } from "./dto/payment-settings.dto.js";
import { PaymentSettingsService } from "./payment-settings.service.js";

interface TenantCtx { restaurantId: string; slug: string }

@Controller("restaurant/:slug/payment-settings")
@UseGuards(RestaurantAuthGuard, TenantGuard)
export class PaymentSettingsController {
  constructor(private readonly payments: PaymentSettingsService) {}

  @Get()
  get(@Tenant() tenant: TenantCtx) {
    return this.payments.get(tenant.restaurantId);
  }

  @Put()
  update(@Tenant() tenant: TenantCtx, @Body() dto: UpdatePaymentSettingsDto) {
    return this.payments.update(tenant.restaurantId, dto);
  }

  @Put("terminals/:kioskId")
  setTerminal(@Tenant() tenant: TenantCtx, @Param("kioskId", new ParseUUIDPipe()) kioskId: string, @Body() dto: UpdateTerminalDto) {
    return this.payments.setTerminal(tenant.restaurantId, kioskId, dto);
  }
}
