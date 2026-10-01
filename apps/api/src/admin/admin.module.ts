import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { AuditService } from "../common/audit.service.js";
import { CryptoService } from "../common/crypto.service.js";
import { ActivityController } from "./activity.controller.js";
import { ActivityService } from "./activity.service.js";
import { RestaurantUsersController } from "./restaurant-users.controller.js";
import { RestaurantUsersService } from "./restaurant-users.service.js";
import { RestaurantsController } from "./restaurants.controller.js";
import { RestaurantsService } from "./restaurants.service.js";
import { TpapiConnectionController } from "./tpapi-connection.controller.js";
import { TpapiConnectionService } from "./tpapi-connection.service.js";

@Module({
  imports: [AuthModule],
  controllers: [RestaurantsController, TpapiConnectionController, RestaurantUsersController, ActivityController],
  providers: [RestaurantsService, TpapiConnectionService, RestaurantUsersService, ActivityService, AuditService, CryptoService],
  exports: [AuditService, CryptoService],
})
export class AdminModule {}
