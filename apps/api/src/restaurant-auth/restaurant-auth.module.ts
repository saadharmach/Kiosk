import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { OrderStatusModule } from "../orders/order-status.module.js";
import { OrderSubmitModule } from "../orders/order-submit.module.js";
import { CatalogAdminController } from "../restaurant/catalog-admin.controller.js";
import { CatalogAdminService } from "../restaurant/catalog-admin.service.js";
import { RestaurantController } from "../restaurant/restaurant.controller.js";
import { RestaurantOrdersController } from "../restaurant/restaurant-orders.controller.js";
import { RestaurantOrdersService } from "../restaurant/restaurant-orders.service.js";
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
  ],
  providers: [
    RestaurantAuthService,
    RestaurantAuthGuard,
    TenantGuard,
    RestaurantOrdersService,
    CatalogAdminService,
    StorageService,
  ],
})
export class RestaurantAuthModule {}