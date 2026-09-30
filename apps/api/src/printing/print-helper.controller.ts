import {
  Body, CanActivate, Controller, ExecutionContext, Get, HttpCode, Injectable, Param, ParseUUIDPipe,
  Post, Req, UnauthorizedException, UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Printer } from "@prisma/client";
import type { Request } from "express";
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

  @Get("next")
  @Throttle(POLL_LIMIT)
  next(@Req() req: HelperRequest) {
    return this.printing.next(req.printer as Printer);
  }

  @Post("jobs/:id/result")
  @HttpCode(200)
  @Throttle(POLL_LIMIT)
  result(@Param("id", new ParseUUIDPipe()) id: string, @Body() dto: JobResultDto, @Req() req: HelperRequest) {
    return this.printing.report(req.printer as Printer, id, dto.ok, dto.error);
  }
}
