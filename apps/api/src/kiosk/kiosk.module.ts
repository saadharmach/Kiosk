import { Module } from "@nestjs/common";
import { StorageService } from "../common/storage.service.js";
import { PaymentsModule } from "../payments/payments.module.js";
import { PrintingModule } from "../printing/printing.module.js";
import { CatalogService } from "./catalog.service.js";
import { KioskController } from "./kiosk.controller.js";
import { OrdersService } from "./orders.service.js";
import { PricingService } from "./pricing.service.js";
import { KioskScreenService } from "./screen.service.js";

@Module({
  imports: [PrintingModule, PaymentsModule],
  controllers: [KioskController],
  providers: [CatalogService, PricingService, OrdersService, StorageService, KioskScreenService],
  exports: [CatalogService, PricingService, OrdersService],
})
export class KioskModule {}