import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import { Roles } from "../auth/decorators/roles.decorator.js";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import { RolesGuard } from "../auth/guards/roles.guard.js";
import type { AccessTokenPayload } from "../auth/token.service.js";
import { AddPeriodDto, CancelPeriodDto, ChangePeriodDto } from "./dto/subscription.dto.js";
import { SubscriptionsService } from "./subscriptions.service.js";

/** Every platform role can look; only SUPER_ADMIN changes a subscription. */
@Controller("admin/restaurants/:id/subscription")
@UseGuards(JwtAuthGuard, RolesGuard)
export class SubscriptionsController {
  constructor(private readonly subs: SubscriptionsService) {}

  @Get()
  get(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.subs.get(id);
  }

  @Post("periods")
  @Roles("SUPER_ADMIN")
  add(@Param("id", new ParseUUIDPipe()) id: string, @Body() dto: AddPeriodDto, @CurrentUser() user: AccessTokenPayload, @Req() req: Request) {
    return this.subs.add(id, dto, { id: user.sub }, req);
  }

  @Patch("periods/:periodId")
  @Roles("SUPER_ADMIN")
  change(
    @Param("id", new ParseUUIDPipe()) id: string, @Param("periodId", new ParseUUIDPipe()) periodId: string,
    @Body() dto: ChangePeriodDto, @CurrentUser() user: AccessTokenPayload, @Req() req: Request,
  ) {
    return this.subs.change(id, periodId, dto, { id: user.sub }, req);
  }

  @Post("periods/:periodId/cancel")
  @HttpCode(200)
  @Roles("SUPER_ADMIN")
  cancel(
    @Param("id", new ParseUUIDPipe()) id: string, @Param("periodId", new ParseUUIDPipe()) periodId: string,
    @Body() dto: CancelPeriodDto, @CurrentUser() user: AccessTokenPayload, @Req() req: Request,
  ) {
    return this.subs.cancel(id, periodId, dto.reason, { id: user.sub }, req);
  }
}
