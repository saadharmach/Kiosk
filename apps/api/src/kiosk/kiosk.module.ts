import { Module } from "@nestjs/common";
import { CatalogService } from "./catalog.service.js";
import { KioskController } from "./kiosk.controller.js";
import { OrdersService } from "./orders.service.js";
import { PricingService } from "./pricing.service.js";

@Module({
  controllers: [KioskController],
  providers: [CatalogService, PricingService, OrdersService],
  exports: [CatalogService, PricingService, OrdersService],
})
export class KioskModule {}