import { Module } from "@nestjs/common";
import { CatalogService } from "./catalog.service.js";
import { KioskController } from "./kiosk.controller.js";

@Module({
  controllers: [KioskController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class KioskModule {}