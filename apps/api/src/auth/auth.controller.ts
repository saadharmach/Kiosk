import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { REFRESH_COOKIE, REFRESH_COOKIE_PATH, cookieSecure } from "../config/env.js";
import { AuthService } from "./auth.service.js";
import { AllowWhilePasswordChangeRequired } from "./decorators/allow-while-password-change.decorator.js";
import { CurrentUser } from "./decorators/current-user.decorator.js";
import { ChangePasswordDto } from "./dto/change-password.dto.js";
import { LoginDto } from "./dto/login.dto.js";
import { JwtAuthGuard } from "./guards/jwt-auth.guard.js";
import type { AccessTokenPayload } from "./token.service.js";

@Controller("admin/auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("login")
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(dto.email, dto.password, ctxOf(req));
    this.setCookie(res, result.refreshToken, result.refreshExpiresAt);
    return { accessToken: result.accessToken };
  }

  @Post("refresh")
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.refresh(req.cookies?.[REFRESH_COOKIE], ctxOf(req));
    this.setCookie(res, result.refreshToken, result.refreshExpiresAt);
    return { accessToken: result.accessToken };
  }

  @Post("logout")
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
  }

  /** Under admin/auth so the browser sends the session cookie: the current session is the one that survives. */
  @Post("change-password")
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  @AllowWhilePasswordChangeRequired()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async changePassword(@Body() dto: ChangePasswordDto, @CurrentUser() user: AccessTokenPayload, @Req() req: Request) {
    await this.auth.changePassword(user.sub, dto.currentPassword, dto.newPassword, req.cookies?.[REFRESH_COOKIE], req);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  @AllowWhilePasswordChangeRequired()
  me(@CurrentUser() user: AccessTokenPayload) {
    return this.auth.me(user.sub);
  }

  private setCookie(res: Response, token: string, expiresAt: Date): void {
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: cookieSecure,
      sameSite: "lax",
      path: REFRESH_COOKIE_PATH,
      expires: expiresAt,
    });
  }
}

function ctxOf(req: Request) {
  return { userAgent: req.headers["user-agent"], ipAddress: req.ip };
}