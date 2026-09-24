import { Body, Controller, Get, HttpCode, Param, Post, Put, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import { Roles } from "../auth/decorators/roles.decorator.js";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import { RolesGuard } from "../auth/guards/roles.guard.js";
import type { AccessTokenPayload } from "../auth/token.service.js";
import { UpsertTpapiDto } from "./dto/upsert-tpapi.dto.js";
import { TpapiConnectionService } from "./tpapi-connection.service.js";

@Controller("admin/restaurants/:id/tpapi")
@UseGuards(JwtAuthGuard, RolesGuard)
export class TpapiConnectionController {
  constructor(private readonly tpapi: TpapiConnectionService) {}

  @Get()
  get(@Param("id") id: string) {
    return this.tpapi.get(id);
  }

  @Put()
  @Roles("SUPER_ADMIN")
  upsert(
    @Param("id") id: string,
    @Body() dto: UpsertTpapiDto,
    @CurrentUser() user: AccessTokenPayload,
    @Req() req: Request,
  ) {
    return this.tpapi.upsert(id, dto, user.sub, req);
  }

  @Post("test")
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  test(@Param("id") id: string, @CurrentUser() user: AccessTokenPayload) {
    return this.tpapi.test(id, user.sub);
  }
}