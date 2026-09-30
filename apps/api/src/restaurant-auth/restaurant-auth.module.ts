import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { OrderStatusModule } from "../orders/order-status.module.js";
import { OrderSubmitModule } from "../orders/order-submit.module.js";
import { BrandingController } from "../restaurant/branding.controller.js";
import { BrandingService } from "../restaurant/branding.service.js";
import { CatalogAdminController } from "../restaurant/catalog-admin.controller.js";
import { CatalogAdminService } from "../restaurant/catalog-admin.service.js";
import { RestaurantController } from "../restaurant/restaurant.controller.js";
import { RestaurantOrdersController } from "../restaurant/restaurant-orders.controller.js";
import { RestaurantOrdersService } from "../restaurant/restaurant-orders.service.js";
import { SettingsController } from "../restaurant/settings.controller.js";
import { SettingsService } from "../restaurant/settings.service.js";
import { RestaurantAuthController } from "./restaurant-auth.controller.js";
import { RestaurantAuthService } from "./restaurant-auth.service.js";
import { RestaurantAuthGuard } from "./guards/restaurant-auth.guard.js";
import { TenantGuard } from "./guards/tenant.guard.js";
import { StorageService } from "../common/storage.service.js";

@Module({
  imports: [AuthModule, OrderStatusModule, OrderSubmitModule],
  controllers: [
    RestaurantAuthController,
    RestaurantController,
    RestaurantOrdersController,
    CatalogAdminController,
    BrandingController,
    SettingsController,
  ],
  providers: [
    RestaurantAuthService,
    RestaurantAuthGuard,
    TenantGuard,
    RestaurantOrdersService,
    CatalogAdminService,
    BrandingService,
    SettingsService,
    StorageService,
  ],
})
export class RestaurantAuthModule {}