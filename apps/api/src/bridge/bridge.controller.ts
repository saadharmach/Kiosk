import {
  Body, CanActivate, Controller, ExecutionContext, Get, HttpCode, Injectable, Param, ParseUUIDPipe,
  Post, Query, Req, Res, UnauthorizedException, UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Type } from "class-transformer";
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import type { Request, Response } from "express";
import { PairDto } from "../printing/dto.js";
import { TillBridgeService, type BridgeConn } from "./till-bridge.service.js";

type BridgeRequest = Request & { bridge?: BridgeConn };

/** The bridge signs in with its own secret, never with a person's account. */
@Injectable()
export class BridgeGuard implements CanActivate {
  constructor(private readonly bridges: TillBridgeService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<BridgeRequest>();
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw new UnauthorizedException("Missing bearer token");
    const conn = await this.bridges.authenticate(header.slice(7));
    if (!conn) throw new UnauthorizedException("Invalid bridge token");
    req.bridge = conn;
    return true;
  }
}

export class BridgeResultDto {
  @IsBoolean() ok!: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(999) status?: number;
  @IsOptional() @IsString() @MaxLength(200) statusText?: string;
  /** The till's answer, gzip then base64 (a menu can be a few megabytes of XML). */
  @IsOptional() @IsString() @MaxLength(40_000_000) textGzipBase64?: string;
  @IsOptional() @IsString() @MaxLength(1000) error?: string;
}

// The bridge asks continuously and answers every call: a higher limit than the default.
const BRIDGE_LIMIT = { default: { limit: 600, ttl: 60_000 } };

@Controller("bridge")
export class BridgeController {
  constructor(private readonly bridges: TillBridgeService) {}

  /** `?wait=20` holds the request open for up to 20 seconds until a call for the till arrives. */
  @Get("next")
  @UseGuards(BridgeGuard)
  @Throttle(BRIDGE_LIMIT)
  next(@Req() req: BridgeRequest, @Res({ passthrough: true }) res: Response, @Query("wait") wait?: string) {
    const waitMs = Math.min(25, Math.max(0, Number(wait) || 0)) * 1000;
    // If the bridge hangs up while waiting, stop: it must not be handed calls it will never see.
    const hangup = new AbortController();
    res.on("close", () => { if (!res.writableFinished) hangup.abort(); });
    return this.bridges.next(req.bridge as BridgeConn, waitMs, hangup.signal);
  }

  @Post("jobs/:id/result")
  @HttpCode(200)
  @UseGuards(BridgeGuard)
  @Throttle(BRIDGE_LIMIT)
  result(@Param("id", new ParseUUIDPipe()) id: string, @Body() dto: BridgeResultDto, @Req() req: BridgeRequest) {
    return this.bridges.reply(req.bridge as BridgeConn, id, dto.ok
      ? { ok: true, status: dto.status ?? 200, statusText: dto.statusText, textGzipBase64: dto.textGzipBase64 ?? "" }
      : { ok: false, error: dto.error ?? "unknown error" });
  }

  /** The bridge's first call: trades the one-time setup code from the admin for its secret. No sign-in needed. */
  @Post("pair")
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  pair(@Body() dto: PairDto) {
    return this.bridges.redeemPairingCode(dto.code);
  }
}
