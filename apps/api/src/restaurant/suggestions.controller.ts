import { BadRequestException, Body, Controller, Get, Param, Put, UseGuards } from "@nestjs/common";
import { RestaurantAuthGuard } from "../restaurant-auth/guards/restaurant-auth.guard.js";
import { TenantGuard } from "../restaurant-auth/guards/tenant.guard.js";
import { Tenant } from "../restaurant-auth/tenant.decorator.js";
import { SetSuggestionsDto } from "./dto/suggestions.dto.js";
import { SuggestionsService } from "./suggestions.service.js";

interface TenantCtx { restaurantId: string; slug: string }

@Controller("restaurant/:slug/suggestions")
@UseGuards(RestaurantAuthGuard, TenantGuard)
export class SuggestionsController {
  constructor(private readonly suggestions: SuggestionsService) {}

  @Get()
  list(@Tenant() tenant: TenantCtx) {
    return this.suggestions.list(tenant.restaurantId);
  }

  @Put(":departmentId")
  replace(
    @Tenant() tenant: TenantCtx,
    @Param("departmentId") departmentId: string,
    @Body() dto: SetSuggestionsDto,
  ) {
    // BigInt() would throw a 500 on anything but digits.
    if (!/^[0-9]{1,19}$/.test(departmentId)) throw new BadRequestException("departmentId must be a number");
    return this.suggestions.replace(tenant.restaurantId, departmentId, dto.articleIds);
  }
}
