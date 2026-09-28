import { Module } from "@nestjs/common";
import { OrderStatusService } from "./order-status.service.js";

@Module({
  providers: [OrderStatusService],
  exports: [OrderStatusService],
})
export class OrderStatusModule {}
