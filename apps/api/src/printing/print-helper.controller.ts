import {
  Body, CanActivate, Controller, ExecutionContext, Get, HttpCode, Injectable, Param, ParseUUIDPipe,
  Post, Query, Req, Res, UnauthorizedException, UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Printer } from "@prisma/client";
import type { Request, Response } from "express";
import { JobResultDto } from "./dto.js";
import { PrintingService } from "./printing.service.js";

type HelperRequest = Request & { printer?: Printer };

/** The print helper signs in with the printer's secret, never with a person's account. */
@Injectable()
export class PrinterHelperGuard implements CanActivate {
  constructor(private readonly printing: PrintingService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<HelperRequest>();
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw new UnauthorizedException("Missing bearer token");
    const printer = await this.printing.authenticate(header.slice(7));
    if (!printer) throw new UnauthorizedException("Invalid helper token");
    req.printer = printer;
    return true;
  }
}

// A helper asks every couple of seconds, so its limit is higher than the default.
const POLL_LIMIT = { default: { limit: 300, ttl: 60_000 } };

@Controller("print")
@UseGuards(PrinterHelperGuard)
export class PrintHelperController {
  constructor(private readonly printing: PrintingService) {}

  /** `?wait=20` holds the request open for up to 20 seconds until a ticket arrives. */
  @Get("next")
  @Throttle(POLL_LIMIT)
  next(@Req() req: HelperRequest, @Res({ passthrough: true }) res: Response, @Query("wait") wait?: string) {
    // Keep it below what a proxy in front of the API will tolerate.
    const waitMs = Math.min(25, Math.max(0, Number(wait) || 0)) * 1000;
    // If the helper hangs up while waiting, stop waiting: it must not be handed a ticket it will never see.
    const hangup = new AbortController();
    res.on("close", () => { if (!res.writableFinished) hangup.abort(); });
    return this.printing.next(req.printer as Printer, waitMs, hangup.signal);
  }

  @Post("jobs/:id/result")
  @HttpCode(200)
  @Throttle(POLL_LIMIT)
  result(@Param("id", new ParseUUIDPipe()) id: string, @Body() dto: JobResultDto, @Req() req: HelperRequest) {
    return this.printing.report(req.printer as Printer, id, dto.ok, dto.error);
  }
}
