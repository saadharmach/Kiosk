import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

export interface PlatformStanding {
  isActive: boolean;
  role: string;
  mustChangePassword: boolean;
}

/** A switched-off or demoted person loses access within this many seconds, even though their token is still valid. */
export const STANDING_TTL_MS = 10_000;

/**
 * The current truth about a platform user: are they still switched on, what is their role now, and must they
 * choose a new password first. A token only says who someone WAS when it was issued, so the guard asks here on
 * every request. The answer is cached for a few seconds so a busy console does not become a stream of queries,
 * and is dropped the moment a change is made through this server.
 */
@Injectable()
export class PlatformUserDirectory {
  private readonly cache = new Map<string, { at: number; value: PlatformStanding | null }>();

  constructor(private readonly prisma: PrismaService) {}

  async standing(userId: string, now = Date.now()): Promise<PlatformStanding | null> {
    const hit = this.cache.get(userId);
    if (hit && now - hit.at < STANDING_TTL_MS) return hit.value;
    const user = await this.prisma.platformUser.findUnique({
      where: { id: userId },
      select: { isActive: true, role: true, mustChangePassword: true },
    });
    const value = user ? { isActive: user.isActive, role: user.role as string, mustChangePassword: user.mustChangePassword } : null;
    this.cache.set(userId, { at: now, value });
    return value;
  }

  invalidate(userId?: string): void {
    if (userId) this.cache.delete(userId);
    else this.cache.clear();
  }
}
