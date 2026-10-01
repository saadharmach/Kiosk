import { Body, Controller, Get, HttpCode, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import {
  RESTAURANT_REFRESH_COOKIE,
  RESTAURANT_REFRESH_COOKIE_PATH,
  cookieSecure,
} from "../config/env.js";
import { AccountInviteService } from "../auth/account-invites.service.js";
import { AcceptInviteDto } from "../auth/dto/accept-invite.dto.js";
import { RestaurantLoginDto } from "./dto/restaurant-login.dto.js";
import { RestaurantAuthService } from "./restaurant-auth.service.js";
import { RestaurantAuthGuard } from "./guards/restaurant-auth.guard.js";
import { Tenant } from "./tenant.decorator.js";

@Controller("restaurant/auth")
export class RestaurantAuthController {
  constructor(
    private readonly auth: RestaurantAuthService,
    private readonly invites: AccountInviteService,
  ) {}

  /** The public "choose your password" page asks who the link is for, before the person types anything. */
  @Get("accept-invite")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  previewInvite(@Query("token") token: string) {
    return this.invites.preview("RESTAURANT", token);
  }

  @Post("accept-invite")
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  acceptInvite(@Body() dto: AcceptInviteDto, @Req() req: Request) {
    return this.invites.accept("RESTAURANT", dto.token, dto.password, req);
  }

  @Post("login")
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(@Body() dto: RestaurantLoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const r = await this.auth.login(dto.slug, dto.email, dto.password, ctxOf(req));
    this.setCookie(res, r.refreshToken, r.refreshExpiresAt);
    return { accessToken: r.accessToken };
  }

  @Post("refresh")
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const r = await this.auth.refresh(req.cookies?.[RESTAURANT_REFRESH_COOKIE], ctxOf(req));
    this.setCookie(res, r.refreshToken, r.refreshExpiresAt);
    return { accessToken: r.accessToken };
  }

  @Post("logout")
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[RESTAURANT_REFRESH_COOKIE]);
    res.clearCookie(RESTAURANT_REFRESH_COOKIE, { path: RESTAURANT_REFRESH_COOKIE_PATH });
  }

  @Get("me")
  @UseGuards(RestaurantAuthGuard)
  me(@Tenant() tenant: { userId: string; restaurantId: string }) {
    return this.auth.me(tenant.userId, tenant.restaurantId);
  }

  private setCookie(res: Response, token: string, expiresAt: Date): void {
    res.cookie(RESTAURANT_REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: cookieSecure,
      sameSite: "lax",
      path: RESTAURANT_REFRESH_COOKIE_PATH,
      expires: expiresAt,
    });
  }
}

function ctxOf(req: Request) {
  return { userAgent: req.headers["user-agent"], ipAddress: req.ip };
}