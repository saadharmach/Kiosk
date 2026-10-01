import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { AuditService } from "../common/audit.service.js";
import { CryptoService } from "../common/crypto.service.js";
import { AdminOrdersController } from "./admin-orders.controller.js";
import { AdminOrdersService } from "./admin-orders.service.js";
import { TillLogService } from "./till-log.service.js";
import { OrderStatusModule } from "../orders/order-status.module.js";
import { OrderSubmitModule } from "../orders/order-submit.module.js";
import { RestaurantOrdersService } from "../restaurant/restaurant-orders.service.js";
import { ActivityController } from "./activity.controller.js";
import { ActivityService } from "./activity.service.js";
import { OverviewController } from "./overview.controller.js";
import { OverviewService } from "./overview.service.js";
import { ReadinessController } from "./readiness.controller.js";
import { ReadinessService } from "./readiness.service.js";
import { RestaurantUsersController } from "./restaurant-users.controller.js";
import { RestaurantUsersService } from "./restaurant-users.service.js";
import { RestaurantsController } from "./restaurants.controller.js";
import { RestaurantsService } from "./restaurants.service.js";
import { TpapiConnectionController } from "./tpapi-connection.controller.js";
import { TpapiConnectionService } from "./tpapi-connection.service.js";

@Module({
  imports: [AuthModule, OrderStatusModule, OrderSubmitModule],
  controllers: [RestaurantsController, TpapiConnectionController, RestaurantUsersController, ActivityController, OverviewController, ReadinessController, AdminOrdersController],
  providers: [RestaurantsService, TpapiConnectionService, RestaurantUsersService, ActivityService, OverviewService, ReadinessService, AdminOrdersService, TillLogService, RestaurantOrdersService, AuditService, CryptoService],
  exports: [AuditService, CryptoService],
})
export class AdminModule {}
