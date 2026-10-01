import {
  Controller, DefaultValuePipe, Get, HttpCode, Param, ParseBoolPipe, ParseIntPipe, ParseUUIDPipe, Post, Query, Req, UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import { Roles } from "../auth/decorators/roles.decorator.js";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import { RolesGuard } from "../auth/guards/roles.guard.js";
import type { AccessTokenPayload } from "../auth/token.service.js";
import { AdminOrdersService } from "./admin-orders.service.js";
import { TillLogService } from "./till-log.service.js";

/** Reading is open to every platform role. Re-checking the till is open to support too; retrying is SUPER_ADMIN only. */
@Controller("admin/restaurants/:id")
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminOrdersController {
  constructor(
    private readonly orders: AdminOrdersService,
    private readonly log: TillLogService,
  ) {}

  @Get("orders")
  list(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Query("status") status?: string,
    @Query("reference") reference?: string,
    @Query("page") page?: string,
  ) {
    return this.orders.list(id, { status, reference, page });
  }

  @Get("orders/:orderId")
  detail(@Param("id", new ParseUUIDPipe()) id: string, @Param("orderId", new ParseUUIDPipe()) orderId: string) {
    return this.orders.detail(id, orderId);
  }

  @Post("orders/:orderId/verify")
  @HttpCode(200)
  @Roles("SUPER_ADMIN", "SUPPORT")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  verify(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Param("orderId", new ParseUUIDPipe()) orderId: string,
    @CurrentUser() user: AccessTokenPayload,
    @Req() req: Request,
  ) {
    return this.orders.verify(id, orderId, { id: user.sub }, req);
  }

  @Post("orders/:orderId/retry")
  @HttpCode(200)
  @Roles("SUPER_ADMIN")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  retry(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Param("orderId", new ParseUUIDPipe()) orderId: string,
    @CurrentUser() user: AccessTokenPayload,
    @Req() req: Request,
  ) {
    return this.orders.retry(id, orderId, { id: user.sub }, req);
  }

  @Get("till-log")
  tillLog(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query("failures", new DefaultValuePipe(false), ParseBoolPipe) failures: boolean,
  ) {
    return this.log.list(id, { page, failuresOnly: failures });
  }
}
