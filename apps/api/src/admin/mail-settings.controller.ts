import { Body, Controller, Get, HttpCode, Post, Put, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import { Roles } from "../auth/decorators/roles.decorator.js";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import { RolesGuard } from "../auth/guards/roles.guard.js";
import type { AccessTokenPayload } from "../auth/token.service.js";
import { MailSettingsDto, SendTestMailDto } from "./dto/mail-settings.dto.js";
import { MailSettingsService } from "./mail-settings.service.js";

/** Settings › Email. Every platform role can look (never at the password); only SUPER_ADMIN saves or tests. */
@Controller("admin/settings/mail")
@UseGuards(JwtAuthGuard, RolesGuard)
export class MailSettingsController {
  constructor(private readonly mail: MailSettingsService) {}

  @Get()
  get() {
    return this.mail.view();
  }

  @Put()
  @Roles("SUPER_ADMIN")
  save(@Body() dto: MailSettingsDto, @CurrentUser() user: AccessTokenPayload, @Req() req: Request) {
    return this.mail.save(dto, { id: user.sub }, req);
  }

  @Post("test-connection")
  @HttpCode(200)
  @Roles("SUPER_ADMIN")
  testConnection(@Body() dto: MailSettingsDto) {
    return this.mail.testConnection(dto);
  }

  @Post("send-test")
  @HttpCode(200)
  @Roles("SUPER_ADMIN")
  sendTest(@Body() dto: SendTestMailDto, @CurrentUser() user: AccessTokenPayload, @Req() req: Request) {
    const { to, ...settings } = dto;
    return this.mail.sendTest(settings, to.trim(), { id: user.sub }, req);
  }
}
