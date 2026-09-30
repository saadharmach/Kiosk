import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from "@nestjs/common";
import { RestaurantAuthGuard } from "../restaurant-auth/guards/restaurant-auth.guard.js";
import { TenantGuard } from "../restaurant-auth/guards/tenant.guard.js";
import { Tenant } from "../restaurant-auth/tenant.decorator.js";
import { SavePrinterDto } from "./dto.js";
import { PrintingService } from "./printing.service.js";

interface TenantCtx { restaurantId: string; slug: string }

/** The restaurant's ticket printer, from the back office. */
@Controller("restaurant/:slug/printer")
@UseGuards(RestaurantAuthGuard, TenantGuard)
export class PrinterController {
  constructor(private readonly printing: PrintingService) {}

  @Get()
  get(@Tenant() tenant: TenantCtx) {
    return this.printing.get(tenant.restaurantId);
  }

  @Put()
  save(@Tenant() tenant: TenantCtx, @Body() dto: SavePrinterDto) {
    return this.printing.save(tenant.restaurantId, dto);
  }

  /** Generates a new helper secret and shows it once. The old one stops working. */
  @Post("token")
  @HttpCode(200)
  token(@Tenant() tenant: TenantCtx) {
    return this.printing.issueToken(tenant.restaurantId);
  }

  @Post("test")
  @HttpCode(200)
  test(@Tenant() tenant: TenantCtx) {
    return this.printing.enqueueTest(tenant.restaurantId);
  }

  @Get("jobs")
  jobs(@Tenant() tenant: TenantCtx, @Query("limit") limit?: string) {
    return this.printing.listJobs(tenant.restaurantId, Number(limit) || 20);
  }
}

/** Reprint a customer's ticket. */
@Controller("restaurant/:slug/orders")
@UseGuards(RestaurantAuthGuard, TenantGuard)
export class OrderPrintController {
  constructor(private readonly printing: PrintingService) {}

  @Post(":orderId/print")
  @HttpCode(200)
  print(@Tenant() tenant: TenantCtx, @Param("orderId", new ParseUUIDPipe()) orderId: string) {
    return this.printing.enqueueForOrder(tenant.restaurantId, orderId, false);
  }
}
