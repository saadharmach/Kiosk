import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { RestaurantController } from "../restaurant/restaurant.controller.js";
import { RestaurantAuthController } from "./restaurant-auth.controller.js";
import { RestaurantAuthService } from "./restaurant-auth.service.js";
import { RestaurantAuthGuard } from "./guards/restaurant-auth.guard.js";
import { TenantGuard } from "./guards/tenant.guard.js";

@Module({
  imports: [AuthModule],
  controllers: [RestaurantAuthController, RestaurantController],
  providers: [RestaurantAuthService, RestaurantAuthGuard, TenantGuard],
})
export class RestaurantAuthModule {}