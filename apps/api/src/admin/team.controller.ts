import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import { Roles } from "../auth/decorators/roles.decorator.js";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import { RolesGuard } from "../auth/guards/roles.guard.js";
import type { AccessTokenPayload } from "../auth/token.service.js";
import { CreateTeamMemberDto, UpdateTeamMemberDto } from "./dto/team.dto.js";
import { TeamService } from "./team.service.js";

/** The platform's own staff: SUPER_ADMIN only, for reading as well as changing. */
@Controller("admin/team")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("SUPER_ADMIN")
export class TeamController {
  constructor(private readonly team: TeamService) {}

  @Get()
  list() {
    return this.team.list();
  }

  @Get("activity")
  activity() {
    return this.team.activity();
  }

  @Post()
  create(@Body() dto: CreateTeamMemberDto, @CurrentUser() user: AccessTokenPayload, @Req() req: Request) {
    return this.team.create(dto, { id: user.sub }, req);
  }

  @Patch(":id")
  update(@Param("id", new ParseUUIDPipe()) id: string, @Body() dto: UpdateTeamMemberDto, @CurrentUser() user: AccessTokenPayload, @Req() req: Request) {
    return this.team.update(id, dto, { id: user.sub }, req);
  }

  @Post(":id/resend-invitation")
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  resendInvitation(@Param("id", new ParseUUIDPipe()) id: string, @CurrentUser() user: AccessTokenPayload, @Req() req: Request) {
    return this.team.resendInvitation(id, { id: user.sub }, req);
  }

  @Post(":id/reset-password")
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  resetPassword(@Param("id", new ParseUUIDPipe()) id: string, @CurrentUser() user: AccessTokenPayload, @Req() req: Request) {
    return this.team.resetPassword(id, { id: user.sub }, req);
  }
}
