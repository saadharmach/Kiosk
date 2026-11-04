import { Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { CatalogService } from "./catalog.service.js";
import { CreateOrderDto, PayDto, PriceCartDto, SimulatePaymentDto } from "./dto/cart.dto.js";
import { OrdersService } from "./orders.service.js";
import { RegisterScreenDto } from "./dto/cart.dto.js";
import { KioskScreenService } from "./screen.service.js";
import { SCREEN_HEADER } from "./screen.js";

@Controller("kiosk/:slug")
export class KioskController {
  constructor(
    private readonly catalogService: CatalogService,
    private readonly ordersService: OrdersService,
    private readonly screens: KioskScreenService,
  ) {}

  /** A screen registers itself as one of the restaurant's bornes, with the one-time code from the back office. */
  @Post("register")
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  register(@Param("slug") slug: string, @Body() dto: RegisterScreenDto) {
    return this.screens.register(slug, dto.code);
  }

  @Get("bootstrap")
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  bootstrap(@Param("slug") slug: string, @Query("borne") borne?: string, @Headers(SCREEN_HEADER) screen?: string) {
    return this.catalogService.bootstrap(slug, borne, screen);
  }

 @Get("version")
  // Every kiosk asks every 20 seconds; small and cheap, so its own limit is generous.
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  version(@Param("slug") slug: string, @Headers(SCREEN_HEADER) screen?: string) {
    return this.catalogService.version(slug, screen);
  }

     @Get("catalog")
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  getCatalog(
    @Param("slug") slug: string,
    @Query("salesAreaId") salesAreaId?: string,
    @Query("locale") locale?: string,
    @Headers(SCREEN_HEADER) screen?: string,
  ) {
    return this.catalogService.catalog(slug, salesAreaId, locale, screen);
  }

  @Post("cart/price")
  @HttpCode(200)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  priceCart(@Param("slug") slug: string, @Body() dto: PriceCartDto, @Headers(SCREEN_HEADER) screen?: string) {
    return this.ordersService.preview(slug, dto, screen);
  }

  @Post("orders")
  @HttpCode(201)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  createOrder(@Param("slug") slug: string, @Body() dto: CreateOrderDto, @Headers(SCREEN_HEADER) screen?: string) {
    return this.ordersService.create(slug, dto, screen);
  }

  /** After a card payment that did not go through: try the card again, or pay cash. */
  @Post("orders/:clientOrderId/pay")
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  pay(@Param("slug") slug: string, @Param("clientOrderId", new ParseUUIDPipe()) clientOrderId: string, @Body() dto: PayDto, @Headers(SCREEN_HEADER) screen?: string) {
    return this.ordersService.pay(slug, clientOrderId, dto.method, screen);
  }

  /** The customer stopped at the card terminal screen. */
  @Post("orders/:clientOrderId/payment/cancel")
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  cancelPayment(@Param("slug") slug: string, @Param("clientOrderId", new ParseUUIDPipe()) clientOrderId: string, @Headers(SCREEN_HEADER) screen?: string) {
    return this.ordersService.cancelPayment(slug, clientOrderId, screen);
  }

  /** Test only: the simulator's approve/decline buttons. Refused unless the server allows the simulator. */
  @Post("orders/:clientOrderId/payment/simulate")
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  simulatePayment(@Param("slug") slug: string, @Param("clientOrderId", new ParseUUIDPipe()) clientOrderId: string, @Body() dto: SimulatePaymentDto, @Headers(SCREEN_HEADER) screen?: string) {
    return this.ordersService.simulatePayment(slug, clientOrderId, dto.approve, screen);
  }

  @Get("orders/:clientOrderId")
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  getOrder(
    @Param("slug") slug: string,
    @Param("clientOrderId", new ParseUUIDPipe()) clientOrderId: string,
    @Headers(SCREEN_HEADER) screen?: string,
  ) {
    return this.ordersService.getByClientOrderId(slug, clientOrderId, screen);
  }
}
