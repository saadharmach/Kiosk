import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { OrderStatusModule } from "../orders/order-status.module.js";
import { OrderSubmitModule } from "../orders/order-submit.module.js";
import { BrandingController } from "../restaurant/branding.controller.js";
import { BrandingService } from "../restaurant/branding.service.js";
import { CatalogAdminController } from "../restaurant/catalog-admin.controller.js";
import { CatalogAdminService } from "../restaurant/catalog-admin.service.js";
import { KiosksController } from "../restaurant/kiosks.controller.js";
import { KiosksService } from "../restaurant/kiosks.service.js";
import { RestaurantController } from "../restaurant/restaurant.controller.js";
import { RestaurantOrdersController } from "../restaurant/restaurant-orders.controller.js";
import { RestaurantOrdersService } from "../restaurant/restaurant-orders.service.js";
import { SettingsController } from "../restaurant/settings.controller.js";
import { SettingsService } from "../restaurant/settings.service.js";
import { SuggestionsController } from "../restaurant/suggestions.controller.js";
import { SuggestionsService } from "../restaurant/suggestions.service.js";
import { RestaurantAuthController } from "./restaurant-auth.controller.js";
import { RestaurantAuthService } from "./restaurant-auth.service.js";
import { RestaurantAuthGuard } from "./guards/restaurant-auth.guard.js";
import { TenantGuard } from "./guards/tenant.guard.js";
import { StorageService } from "../common/storage.service.js";
import { OrderPrintController, PrinterController } from "../printing/printer.controller.js";
import { PrintingModule } from "../printing/printing.module.js";

@Module({
  imports: [AuthModule, OrderStatusModule, OrderSubmitModule, PrintingModule],
  controllers: [
    RestaurantAuthController,
    RestaurantController,
    RestaurantOrdersController,
    CatalogAdminController,
    BrandingController,
    PrinterController,
    OrderPrintController,
    SettingsController,
    SuggestionsController,
    KiosksController,
  ],
  providers: [
    RestaurantAuthService,
    RestaurantAuthGuard,
    TenantGuard,
    RestaurantOrdersService,
    CatalogAdminService,
    BrandingService,
    SettingsService,
    SuggestionsService,
    KiosksService,
    StorageService,
  ],
})
export class RestaurantAuthModule {}