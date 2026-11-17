import { BadGatewayException, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { TpapiError, TpapiReturnCodeError, TpapiTransportError } from "@kiosk/tpapi";
import { Throttle } from "@nestjs/throttler";
import { Roles } from "../auth/decorators/roles.decorator.js";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import { RolesGuard } from "../auth/guards/roles.guard.js";
import { CatalogSyncService } from "./catalog-sync.service.js";
import { SyncSchedulerService } from "./sync-scheduler.service.js";

@Controller("admin/restaurants/:id")
@UseGuards(JwtAuthGuard, RolesGuard)
export class SyncController {
  constructor(
    private readonly sync: CatalogSyncService,
    private readonly scheduler: SyncSchedulerService,
  ) {}

  @Post("sync")
  @HttpCode(200)
  @Roles("SUPER_ADMIN", "SUPPORT")
  @Throttle({ default: { limit: 5, ttl: 300_000 } })
  async run(@Param("id", new ParseUUIDPipe()) id: string) {
    try {
      return await this.sync.run(id, "MANUAL");
    } catch (e) {
      // The till refused or did not answer: say so in its own words, not "Internal server error". (The failed run is
      // already recorded in the sync history.)
      throw tillProblem(e);
    }
  }

  @Get("sync-schedule")
  schedule(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.scheduler.scheduleFor(id);
  }

  @Get("sync-runs")
  history(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.sync.history(id);
  }
}
/** A TPAPI failure as an answer the admin can show; anything else is left as it is. */
export function tillProblem(e: unknown): unknown {
  if (!(e instanceof TpapiError)) return e;
  if (e instanceof TpapiTransportError) return new BadGatewayException({ code: "TILL_ERROR", message: `The till did not answer: ${e.message}` });
  const detail = e instanceof TpapiReturnCodeError ? e.returnMessage || e.message : e.message;
  return new BadGatewayException({ code: "TILL_ERROR", message: `The till refused the sync: ${detail}` });
}
