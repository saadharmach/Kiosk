import { Controller, Get, Param, ParseIntPipe, ParseUUIDPipe, Query, UseGuards, DefaultValuePipe } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import { RolesGuard } from "../auth/guards/roles.guard.js";
import { ActivityService } from "./activity.service.js";

@Controller("admin/restaurants/:id/activity")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  @Get()
  list(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
  ) {
    return this.activity.list(id, Math.max(1, page));
  }
}
