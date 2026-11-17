import { Module } from "@nestjs/common";
import { CryptoService } from "../common/crypto.service.js";
import { StorageService } from "../common/storage.service.js";
import { TpapiClientFactory } from "../common/tpapi-client.factory.js";
import { PaymentsModule } from "../payments/payments.module.js";
import { PrintingModule } from "../printing/printing.module.js";
import { CatalogService } from "./catalog.service.js";
import { KioskController } from "./kiosk.controller.js";
import { OrdersService } from "./orders.service.js";
import { PricingService } from "./pricing.service.js";
import { KioskScreenService } from "./screen.service.js";
import { TableOccupancyService } from "./table-occupancy.js";

@Module({
  imports: [PrintingModule, PaymentsModule],
  controllers: [KioskController],
  providers: [CatalogService, PricingService, OrdersService, StorageService, KioskScreenService, TableOccupancyService, TpapiClientFactory, CryptoService],
  exports: [CatalogService, PricingService, OrdersService],
})
export class KioskModule {}