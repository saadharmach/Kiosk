import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { CatalogService } from "./catalog.service.js";
import { CreateOrderDto, PriceCartDto } from "./dto/cart.dto.js";
import { OrdersService } from "./orders.service.js";

@Controller("kiosk/:slug")
export class KioskController {
  constructor(
    private readonly catalogService: CatalogService,
    private readonly ordersService: OrdersService,
  ) {}

  @Get("bootstrap")
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  bootstrap(@Param("slug") slug: string, @Query("borne") borne?: string) {
    return this.catalogService.bootstrap(slug, borne);
  }

   @Get("catalog")
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  getCatalog(
    @Param("slug") slug: string,
    @Query("salesAreaId") salesAreaId?: string,
    @Query("locale") locale?: string,
  ) {
    return this.catalogService.catalog(slug, salesAreaId, locale);
  }

  @Post("cart/price")
  @HttpCode(200)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  priceCart(@Param("slug") slug: string, @Body() dto: PriceCartDto) {
    return this.ordersService.preview(slug, dto);
  }

  @Post("orders")
  @HttpCode(201)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  createOrder(@Param("slug") slug: string, @Body() dto: CreateOrderDto) {
    return this.ordersService.create(slug, dto);
  }

  @Get("orders/:clientOrderId")
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  getOrder(
    @Param("slug") slug: string,
    @Param("clientOrderId", new ParseUUIDPipe()) clientOrderId: string,
  ) {
    return this.ordersService.getByClientOrderId(slug, clientOrderId);
  }
}
