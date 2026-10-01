import { Controller, Get, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import { RolesGuard } from "../auth/guards/roles.guard.js";
import { OverviewService } from "./overview.service.js";

/** Read-only, so open to every platform role. */
@Controller("admin/overview")
@UseGuards(JwtAuthGuard, RolesGuard)
export class OverviewController {
  constructor(private readonly overview: OverviewService) {}

  @Get()
  get() {
    return this.overview.get();
  }
}
