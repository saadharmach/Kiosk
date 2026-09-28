import { Module } from "@nestjs/common";
import { CryptoService } from "../common/crypto.service.js";
import { TpapiClientFactory } from "../common/tpapi-client.factory.js";
import { OrderStatusModule } from "./order-status.module.js";
import { OrderSubmitService } from "./order-submit.service.js";

@Module({
  imports: [OrderStatusModule],
  providers: [OrderSubmitService, TpapiClientFactory, CryptoService],
  exports: [OrderSubmitService],
})
export class OrderSubmitModule {}
