import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { CatalogSyncService } from "./catalog-sync.service.js";
import { RUN_STALE_MIN, isSyncDue, nextSyncAt, syncConfigFromEnv, type RunFacts, type SyncConfig } from "./sync-schedule.js";

const TICK_MS = Number(process.env.CATALOG_SYNC_TICK_MS ?? 60_000);
const FIRST_TICK_MS = Number(process.env.CATALOG_SYNC_FIRST_TICK_MS ?? 30_000);
const HISTORY_WINDOW_MS = 24 * 3_600_000;

/**
 * Reads each active restaurant's menu from its till on a schedule, so a price changed in unTill reaches the
 * kiosk without anyone pressing a button. One restaurant at a time, so the till is never hit by several at once.
 */
@Injectable()
export class SyncSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SyncSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private first: NodeJS.Timeout | null = null;
  private ticking = false;
  readonly config: SyncConfig = syncConfigFromEnv();

  constructor(
    private readonly prisma: PrismaService,
    private readonly sync: CatalogSyncService,
  ) {}

  async onModuleInit() {
    if (this.config.intervalMin <= 0) {
      this.logger.warn("Automatic menu sync is off (CATALOG_SYNC_INTERVAL_MIN=0): menus change only when someone presses Sync now");
      return;
    }
    // A sync that was running when the server stopped will never finish: close it, so it does not block the next one.
    await this.closeInterrupted().catch((e) => this.logger.error(`Could not close interrupted syncs: ${String(e)}`));

    // The first look comes a little after start-up, so the server is fully up and a restart loop cannot hammer the tills.
    this.first = setTimeout(() => {
      void this.tick();
      this.timer = setInterval(() => void this.tick(), TICK_MS);
      this.timer.unref?.();
    }, FIRST_TICK_MS);
    this.first.unref?.();
    this.logger.log(`Automatic menu sync every ${this.config.intervalMin} min (retry from ${this.config.retryMin} min after a failure)`);
  }

  onModuleDestroy() {
    if (this.first) clearTimeout(this.first);
    if (this.timer) clearInterval(this.timer);
  }

  async closeInterrupted(now = Date.now()) {
    await this.prisma.syncRun.updateMany({
      where: { status: "RUNNING", startedAt: { lt: new Date(now - RUN_STALE_MIN * 60_000) } },
      data: { status: "FAILED", finishedAt: new Date(now), errorMessage: "Interrupted: the server stopped during the sync" },
    });
  }

  /** What the admin screen shows: is it automatic, how often, and when is the next read due. */
  async scheduleFor(restaurantId: string, now = Date.now()) {
    const enabled = this.config.intervalMin > 0;
    const runs = await this.prisma.syncRun.findMany({
      where: { restaurantId, startedAt: { gte: new Date(now - HISTORY_WINDOW_MS) } },
      orderBy: { startedAt: "desc" },
      select: { status: true, startedAt: true },
    });
    const at = enabled ? nextSyncAt(runs, this.config, now) : null;
    return {
      enabled,
      intervalMin: this.config.intervalMin,
      // null with enabled=true means "as soon as the scheduler next looks" (nothing has run yet)
      nextAt: at && at.getTime() > now ? at.toISOString() : null,
    };
  }

  /** One pass: sync every restaurant whose turn has come, one after the other. Returns who was synced. */
  async tick(now = Date.now()): Promise<string[]> {
    if (this.ticking) return [];
    this.ticking = true;
    const synced: string[] = [];
    try {
      const restaurants = await this.prisma.restaurant.findMany({
        where: { status: "ACTIVE", tpapi: { is: { isEnabled: true, credentialsCiphertext: { not: null } } } },
        select: { id: true, slug: true },
        orderBy: { createdAt: "asc" },
      });
      if (restaurants.length === 0) return synced;

      const runs = await this.prisma.syncRun.findMany({
        where: { restaurantId: { in: restaurants.map((r) => r.id) }, startedAt: { gte: new Date(now - HISTORY_WINDOW_MS) } },
        orderBy: { startedAt: "desc" },
        select: { restaurantId: true, status: true, startedAt: true },
      });
      const byRestaurant = new Map<string, RunFacts[]>();
      for (const r of runs) byRestaurant.set(r.restaurantId, [...(byRestaurant.get(r.restaurantId) ?? []), r]);

      for (const r of restaurants) {
        if (!isSyncDue(byRestaurant.get(r.id) ?? [], this.config, now)) continue;
        try {
          await this.sync.run(r.id, "SCHEDULED");
          synced.push(r.slug);
        } catch (e) {
          // run() has already recorded the failure; the schedule backs off from it. Carry on with the others.
          this.logger.warn(`Scheduled sync of ${r.slug} failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      return synced;
    } finally {
      this.ticking = false;
    }
  }
}
