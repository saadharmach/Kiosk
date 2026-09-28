import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { RestaurantAuthGuard } from "../restaurant-auth/guards/restaurant-auth.guard.js";
import { TenantGuard } from "../restaurant-auth/guards/tenant.guard.js";
import { Tenant } from "../restaurant-auth/tenant.decorator.js";
import { OrderSubmitService } from "../orders/order-submit.service.js";
import { CancelOrderDto } from "./dto/order-action.dto.js";
import { RestaurantOrdersService } from "./restaurant-orders.service.js";

interface TenantCtx {
  restaurantId: string;
  slug: string;
  sub?: string;
  userId?: string;
}

const actorOf = (t: TenantCtx): string | null => t.sub ?? t.userId ?? null;

@Controller("restaurant/:slug/orders")
@UseGuards(RestaurantAuthGuard, TenantGuard)
export class RestaurantOrdersController {
  constructor(
    private readonly orders: RestaurantOrdersService,
    private readonly submitter: OrderSubmitService,
  ) {}

  @Get()
  list(
    @Tenant() tenant: TenantCtx,
    @Query("status") status?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("reference") reference?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.orders.list(tenant.restaurantId, { status, from, to, reference, page, pageSize });
  }

  @Get(":id")
  detail(@Tenant() tenant: TenantCtx, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.orders.detail(tenant.restaurantId, id);
  }

  @Post(":id/cancel")
  @HttpCode(200)
  cancel(
    @Tenant() tenant: TenantCtx,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: CancelOrderDto,
  ) {
    return this.orders.cancel(tenant.restaurantId, id, actorOf(tenant), dto.reason);
  }

  @Post(":id/retry")
  @HttpCode(200)
  retry(@Tenant() tenant: TenantCtx, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.orders.retry(tenant.restaurantId, id, actorOf(tenant));
  }

  @Post(":id/submit")
  @HttpCode(200)
  submit(@Tenant() tenant: TenantCtx, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.submitter.submit(tenant.restaurantId, id);
  }

  @Post(":id/verify")
  @HttpCode(200)
  verify(@Tenant() tenant: TenantCtx, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.submitter.verify(tenant.restaurantId, id);
  }
}
