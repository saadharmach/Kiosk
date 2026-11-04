import { Body, Controller, Get, HttpCode, Param, ParseEnumPipe, Patch, Post, UseGuards } from "@nestjs/common";
import { RestaurantAuthGuard } from "../restaurant-auth/guards/restaurant-auth.guard.js";
import { TenantGuard } from "../restaurant-auth/guards/tenant.guard.js";
import { Tenant } from "../restaurant-auth/tenant.decorator.js";
import { BrandingService, type BrandingKind } from "./branding.service.js";
import { SignBrandingUploadDto, UpdateBrandingDto } from "./dto/branding.dto.js";

interface TenantCtx { restaurantId: string; slug: string }

enum Kind { logo = "logo", welcome = "welcome" }

/** The restaurant's logo, welcome-screen photos and tagline. */
@Controller("restaurant/:slug/branding")
@UseGuards(RestaurantAuthGuard, TenantGuard)
export class BrandingController {
  constructor(private readonly branding: BrandingService) {}

  @Get()
  get(@Tenant() tenant: TenantCtx) {
    return this.branding.get(tenant.restaurantId);
  }

  @Patch()
  update(@Tenant() tenant: TenantCtx, @Body() dto: UpdateBrandingDto) {
    return this.branding.update(tenant.restaurantId, dto);
  }

  @Post(":kind/sign")
  @HttpCode(200)
  sign(
    @Tenant() tenant: TenantCtx,
    @Param("kind", new ParseEnumPipe(Kind)) kind: BrandingKind,
    @Body() dto: SignBrandingUploadDto,
  ) {
    return this.branding.sign(tenant.restaurantId, kind, dto.contentType);
  }
}
