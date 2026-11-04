import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    const startedAt = Date.now();
    try {
      await this.prisma.ping();
    } catch (e) {
      throw new ServiceUnavailableException({
        status: "error",
        database: "unreachable",
        message: e instanceof Error ? e.message : String(e),
      });
    }
    return {
      status: "ok",
      database: "ok",
      databaseLatencyMs: Date.now() - startedAt,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}