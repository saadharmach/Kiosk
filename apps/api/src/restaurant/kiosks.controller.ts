import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards } from "@nestjs/common";
import { RestaurantAuthGuard } from "../restaurant-auth/guards/restaurant-auth.guard.js";
import { TenantGuard } from "../restaurant-auth/guards/tenant.guard.js";
import { Tenant } from "../restaurant-auth/tenant.decorator.js";
import { SavePrinterDto } from "../printing/dto.js";
import { PrintingService } from "../printing/printing.service.js";
import { CreateKioskDto, UpdateKioskDto } from "./dto/kiosks.dto.js";
import { KiosksService } from "./kiosks.service.js";

interface TenantCtx { restaurantId: string; slug: string }

/** The restaurant's bornes, and the printer each one has. Always for the restaurant of the sign-in. */
@Controller("restaurant/:slug/kiosks")
@UseGuards(RestaurantAuthGuard, TenantGuard)
export class KiosksController {
  constructor(
    private readonly kiosks: KiosksService,
    private readonly printing: PrintingService,
  ) {}

  @Get()
  list(@Tenant() t: TenantCtx) {
    return this.kiosks.list(t.restaurantId, t.slug);
  }

  @Post()
  create(@Tenant() t: TenantCtx, @Body() dto: CreateKioskDto) {
    return this.kiosks.create(t.restaurantId, t.slug, dto.name);
  }

  @Patch(":id")
  update(@Tenant() t: TenantCtx, @Param("id", new ParseUUIDPipe()) id: string, @Body() dto: UpdateKioskDto) {
    return this.kiosks.update(t.restaurantId, id, dto);
  }

  @Delete(":id")
  remove(@Tenant() t: TenantCtx, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.kiosks.remove(t.restaurantId, id);
  }

  // ---- the borne's printer: the same actions as the restaurant's default printer, for this borne only

  @Get(":id/printer")
  async printer(@Tenant() t: TenantCtx, @Param("id", new ParseUUIDPipe()) id: string) {
    await this.kiosks.require(t.restaurantId, id);
    return this.printing.get(t.restaurantId, id);
  }

  @Put(":id/printer")
  async savePrinter(@Tenant() t: TenantCtx, @Param("id", new ParseUUIDPipe()) id: string, @Body() dto: SavePrinterDto) {
    await this.kiosks.require(t.restaurantId, id);
    return this.printing.save(t.restaurantId, dto, id);
  }

  /** A new helper secret for this borne's printer, shown once. */
  @Post(":id/printer/token")
  @HttpCode(200)
  async token(@Tenant() t: TenantCtx, @Param("id", new ParseUUIDPipe()) id: string) {
    await this.kiosks.require(t.restaurantId, id);
    return this.printing.issueToken(t.restaurantId, id);
  }

  /** A one-time setup code for this borne's helper. */
  @Post(":id/printer/pairing")
  @HttpCode(200)
  async pairing(@Tenant() t: TenantCtx, @Param("id", new ParseUUIDPipe()) id: string) {
    await this.kiosks.require(t.restaurantId, id);
    return this.printing.issuePairingCode(t.restaurantId, id);
  }

  @Post(":id/printer/test")
  @HttpCode(200)
  async test(@Tenant() t: TenantCtx, @Param("id", new ParseUUIDPipe()) id: string) {
    await this.kiosks.require(t.restaurantId, id);
    return this.printing.enqueueTest(t.restaurantId, id);
  }

  @Get(":id/printer/jobs")
  async jobs(@Tenant() t: TenantCtx, @Param("id", new ParseUUIDPipe()) id: string, @Query("limit") limit?: string) {
    await this.kiosks.require(t.restaurantId, id);
    return this.printing.listJobs(t.restaurantId, Number(limit) || 20, id);
  }
}
