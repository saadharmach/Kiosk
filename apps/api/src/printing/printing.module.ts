import { Module } from "@nestjs/common";
import { PrintHelperController, PrinterHelperGuard } from "./print-helper.controller.js";
import { PrintingService } from "./printing.service.js";

/** The queue and the print helper's endpoints. The back office controllers live in RestaurantAuthModule. */
@Module({
  controllers: [PrintHelperController],
  providers: [PrintingService, PrinterHelperGuard],
  exports: [PrintingService],
})
export class PrintingModule {}
