import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { AuditService } from "../common/audit.service.js";
import { CryptoService } from "../common/crypto.service.js";
import { RestaurantsController } from "./restaurants.controller.js";
import { RestaurantsService } from "./restaurants.service.js";
import { TpapiConnectionController } from "./tpapi-connection.controller.js";
import { TpapiConnectionService } from "./tpapi-connection.service.js";

@Module({
  imports: [AuthModule],
  controllers: [RestaurantsController, TpapiConnectionController],
  providers: [RestaurantsService, TpapiConnectionService, AuditService, CryptoService],
  exports: [AuditService, CryptoService],
})
export class AdminModule {}
