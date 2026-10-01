import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Roles } from "../auth/decorators/roles.decorator.js";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import { RolesGuard } from "../auth/guards/roles.guard.js";
import { CatalogSyncService } from "./catalog-sync.service.js";

@Controller("admin/restaurants/:id")
@UseGuards(JwtAuthGuard, RolesGuard)
export class SyncController {
  constructor(private readonly sync: CatalogSyncService) {}

  @Post("sync")
  @HttpCode(200)
  @Roles("SUPER_ADMIN", "SUPPORT")
  @Throttle({ default: { limit: 5, ttl: 300_000 } })
  run(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.sync.run(id, "MANUAL");
  }

  @Get("sync-runs")
  history(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.sync.history(id);
  }
}