import { Injectable, Logger } from "@nestjs/common";
import type { Request } from "express";
import { PrismaService } from "../prisma/prisma.service.js";

export type AuditEntry = {
  restaurantId?: string | null;
  actorType?: "PLATFORM_USER" | "RESTAURANT_USER" | "SYSTEM" | "KIOSK";
  actorId?: string | null;
  actorLabel?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
};

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Never throws: a failed audit write must not fail the business operation. */
  async record(entry: AuditEntry, req?: Request): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          restaurantId: entry.restaurantId ?? null,
          actorType: entry.actorType ?? "SYSTEM",
          actorId: entry.actorId ?? null,
          actorLabel: entry.actorLabel ?? null,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId ?? null,
          before: (entry.before ?? undefined) as never,
          after: (entry.after ?? undefined) as never,
          ipAddress: req?.ip ?? null,
          userAgent: req?.headers["user-agent"] ?? null,
        },
      });
    } catch (e) {
      this.logger.error(`Audit write failed for ${entry.action}: ${e instanceof Error ? e.message : e}`);
    }
  }
}