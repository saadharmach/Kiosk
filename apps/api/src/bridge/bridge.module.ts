import { Global, Module } from "@nestjs/common";
import { BridgeController, BridgeGuard } from "./bridge.controller.js";
import { TillBridgeService } from "./till-bridge.service.js";

/** Global: every place that talks to a till (menu sync, orders, the till watch, the admin's test) goes through one queue. */
@Global()
@Module({
  controllers: [BridgeController],
  providers: [TillBridgeService, BridgeGuard],
  exports: [TillBridgeService],
})
export class BridgeModule {}
