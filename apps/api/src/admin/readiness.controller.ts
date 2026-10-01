import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import { RolesGuard } from "../auth/guards/roles.guard.js";
import { ReadinessService } from "./readiness.service.js";

/** Read-only, so open to every platform role. */
@Controller("admin/restaurants/:id/readiness")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReadinessController {
  constructor(private readonly readiness: ReadinessService) {}

  @Get()
  get(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.readiness.get(id);
  }
}
