import { Controller, Get, Param, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { CatalogService } from "./catalog.service.js";

@Controller("kiosk/:slug")
export class KioskController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get("bootstrap")
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  bootstrap(@Param("slug") slug: string) {
    return this.catalogService.bootstrap(slug);
  }

  @Get("catalog")
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  getCatalog(@Param("slug") slug: string, @Query("salesAreaId") salesAreaId?: string) {
    return this.catalogService.catalog(slug, salesAreaId);
  }
}