import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { AuditService } from "../common/audit.service.js";
import { RestaurantsController } from "./restaurants.controller.js";
import { RestaurantsService } from "./restaurants.service.js";

@Module({
  imports: [AuthModule],
  controllers: [RestaurantsController],
  providers: [RestaurantsService, AuditService],
  exports: [AuditService],
})
export class AdminModule {}