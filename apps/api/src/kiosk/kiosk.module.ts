import { Module } from "@nestjs/common";
import { StorageService } from "../common/storage.service.js";
import { PrintingModule } from "../printing/printing.module.js";
import { CatalogService } from "./catalog.service.js";
import { KioskController } from "./kiosk.controller.js";
import { OrdersService } from "./orders.service.js";
import { PricingService } from "./pricing.service.js";

@Module({
  imports: [PrintingModule],
  controllers: [KioskController],
  providers: [CatalogService, PricingService, OrdersService, StorageService],
  exports: [CatalogService, PricingService, OrdersService],
})
export class KioskModule {}