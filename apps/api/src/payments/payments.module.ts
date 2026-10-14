import { Module } from "@nestjs/common";
import { OrderStatusModule } from "../orders/order-status.module.js";
import { PrintingModule } from "../printing/printing.module.js";
import { PaymentsService } from "./payments.service.js";

@Module({
  imports: [OrderStatusModule, PrintingModule],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
