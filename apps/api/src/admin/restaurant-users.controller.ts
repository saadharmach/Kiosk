import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import { Roles } from "../auth/decorators/roles.decorator.js";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import { RolesGuard } from "../auth/guards/roles.guard.js";
import type { AccessTokenPayload } from "../auth/token.service.js";
import { CreateRestaurantUserDto, UpdateRestaurantUserDto } from "./dto/restaurant-user.dto.js";
import { RestaurantUsersService } from "./restaurant-users.service.js";

/** Platform staff may look at a restaurant's users; only a SUPER_ADMIN may change them. */
@Controller("admin/restaurants/:id/users")
@UseGuards(JwtAuthGuard, RolesGuard)
export class RestaurantUsersController {
  constructor(private readonly users: RestaurantUsersService) {}

  @Get()
  list(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.users.list(id);
  }

  @Post()
  @Roles("SUPER_ADMIN")
  create(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: CreateRestaurantUserDto,
    @CurrentUser() user: AccessTokenPayload,
    @Req() req: Request,
  ) {
    return this.users.create(id, dto, { id: user.sub }, req);
  }

  @Patch(":userId")
  @Roles("SUPER_ADMIN")
  update(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Param("userId", new ParseUUIDPipe()) userId: string,
    @Body() dto: UpdateRestaurantUserDto,
    @CurrentUser() user: AccessTokenPayload,
    @Req() req: Request,
  ) {
    return this.users.update(id, userId, dto, { id: user.sub }, req);
  }

  /** Permanent. Only for someone who has been switched off. */
  @Delete(":userId")
  @Roles("SUPER_ADMIN")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  remove(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Param("userId", new ParseUUIDPipe()) userId: string,
    @CurrentUser() user: AccessTokenPayload,
    @Req() req: Request,
  ) {
    return this.users.remove(id, userId, { id: user.sub }, req);
  }

  @Post(":userId/resend-invitation")
  @HttpCode(200)
  @Roles("SUPER_ADMIN")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  resendInvitation(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Param("userId", new ParseUUIDPipe()) userId: string,
    @CurrentUser() user: AccessTokenPayload,
    @Req() req: Request,
  ) {
    return this.users.resendInvitation(id, userId, { id: user.sub }, req);
  }

  @Post(":userId/reset-password")
  @HttpCode(200)
  @Roles("SUPER_ADMIN")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  resetPassword(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Param("userId", new ParseUUIDPipe()) userId: string,
    @CurrentUser() user: AccessTokenPayload,
    @Req() req: Request,
  ) {
    return this.users.resetPassword(id, userId, { id: user.sub }, req);
  }
}
