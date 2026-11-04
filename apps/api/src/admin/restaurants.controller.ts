import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import { Roles } from "../auth/decorators/roles.decorator.js";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import { RolesGuard } from "../auth/guards/roles.guard.js";
import type { AccessTokenPayload } from "../auth/token.service.js";
import { CreateRestaurantDto } from "./dto/create-restaurant.dto.js";
import { ListRestaurantsDto } from "./dto/list-restaurants.dto.js";
import { UpdateRestaurantDto } from "./dto/update-restaurant.dto.js";
import { RestaurantsService } from "./restaurants.service.js";

/** Order matters: JwtAuthGuard sets req.user, RolesGuard then reads it. */
@Controller("admin/restaurants")
@UseGuards(JwtAuthGuard, RolesGuard)
export class RestaurantsController {
  constructor(private readonly restaurants: RestaurantsService) {}

  @Get()
  list(@Query() query: ListRestaurantsDto) {
    return this.restaurants.list(query);
  }

  @Get(":idOrSlug")
  get(@Param("idOrSlug") idOrSlug: string) {
    return this.restaurants.get(idOrSlug);
  }

  @Post()
  @Roles("SUPER_ADMIN")
  create(@Body() dto: CreateRestaurantDto, @CurrentUser() user: AccessTokenPayload, @Req() req: Request) {
    return this.restaurants.create(dto, { id: user.sub }, req);
  }

  @Patch(":id")
  @Roles("SUPER_ADMIN")
  update(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateRestaurantDto,
    @CurrentUser() user: AccessTokenPayload,
    @Req() req: Request,
  ) {
    return this.restaurants.update(id, dto, { id: user.sub }, req);
  }
}