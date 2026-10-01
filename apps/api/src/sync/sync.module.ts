import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { CryptoService } from "../common/crypto.service.js";
import { TpapiClientFactory } from "../common/tpapi-client.factory.js";
import { CatalogSyncService } from "./catalog-sync.service.js";
import { SyncSchedulerService } from "./sync-scheduler.service.js";
import { SyncController } from "./sync.controller.js";

@Module({
  imports: [AuthModule],
  controllers: [SyncController],
  providers: [CatalogSyncService, SyncSchedulerService, TpapiClientFactory, CryptoService],
  exports: [CatalogSyncService, SyncSchedulerService, TpapiClientFactory],
})
export class SyncModule {}