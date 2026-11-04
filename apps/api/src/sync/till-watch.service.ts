import { randomUUID } from "node:crypto";
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { TpapiClientFactory } from "../common/tpapi-client.factory.js";
import { TILL_DOWN_AFTER, TILL_PING_SEC, TILL_PING_TIMEOUT_MS } from "../common/till-health.js";
import { PrismaService } from "../prisma/prisma.service.js";

/**
 * Pings every active restaurant's till (TPAPI Ping, the same call as the admin's "Test connection") every
 * TILL_PING_SEC seconds. After TILL_DOWN_AFTER failures in a row its kiosks show "no connection" and take no
 * orders; the first ping that succeeds puts them back. Only the moments it goes down and comes back are written
 * to the till log, so a ping every 30 seconds does not drown it.
 */
@Injectable()
export class TillWatchService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TillWatchService.name);
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly clients: TpapiClientFactory,
  ) {}

  onModuleInit() {
    if (TILL_PING_SEC <= 0) {
      this.logger.warn("Till watch is off (TILL_WATCH_INTERVAL_SEC=0): kiosks never stop for an unreachable till");
      return;
    }
    this.timer = setInterval(() => void this.safeTick(), TILL_PING_SEC * 1000);
    this.timer.unref?.();
    this.logger.log(`Pinging each till every ${TILL_PING_SEC} s; kiosks stop after ${TILL_DOWN_AFTER} failures in a row`);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** What the timer calls: nothing escapes from here (an uncaught rejection would take the API down). */
  async safeTick(): Promise<void> {
    if (this.ticking) return; // the previous round is still waiting on a slow till
    this.ticking = true;
    try {
      const tills = await this.prisma.tpapiConnection.findMany({
        where: { isEnabled: true, credentialsCiphertext: { not: null }, restaurant: { status: "ACTIVE" } },
        select: { restaurantId: true, pingFailures: true },
      });
      // All at once: each one waits on its own till, and one slow till must not delay the others' answers.
      await Promise.all(tills.map((t) => this.check(t.restaurantId, t.pingFailures).catch((e) => {
        this.logger.error(`Till watch for ${t.restaurantId} failed: ${e instanceof Error ? e.message : String(e)}`);
      })));
    } catch (e) {
      this.logger.error(`Till watch round failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      this.ticking = false;
    }
  }

  /** One ping, and what follows from it. Returns whether the till answered. */
  async check(restaurantId: string, failuresBefore: number, now = new Date()): Promise<boolean> {
    const correlationId = randomUUID();
    let ok = false;
    let message: string | null = null;
    let returnCode: number | null = null;
    let durationMs = 0;
    try {
      const { client } = await this.clients.forRestaurant(restaurantId, { timeoutMs: TILL_PING_TIMEOUT_MS });
      const ping = await client.ping({ correlationId });
      ok = ping.ok;
      durationMs = ping.durationMs;
      returnCode = ping.returnCode ?? null;
      message = ping.error ?? (ping.ok ? null : `ReturnCode ${ping.returnCode}: ${ping.message ?? ""}`);
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    }

    if (ok) {
      await this.prisma.tpapiConnection.updateMany({
        where: { restaurantId },
        data: { pingFailures: 0, unreachableSince: null, lastSuccessAt: now, lastLatencyMs: durationMs, ...(failuresBefore > 0 ? { lastErrorMessage: null } : {}) },
      });
      if (failuresBefore >= TILL_DOWN_AFTER) await this.log(restaurantId, correlationId, true, "The till answers again: the kiosks take orders", returnCode, durationMs);
      return true;
    }

    const failures = failuresBefore + 1;
    await this.prisma.tpapiConnection.updateMany({
      where: { restaurantId },
      data: {
        pingFailures: { increment: 1 },
        lastFailureAt: now,
        lastErrorMessage: message,
        ...(failuresBefore === 0 ? { unreachableSince: now } : {}),
      },
    });
    if (failures === TILL_DOWN_AFTER) {
      this.logger.warn(`Till of ${restaurantId} does not answer (${message}): its kiosks stop taking orders`);
      await this.log(restaurantId, correlationId, false, `The till does not answer: the kiosks stop taking orders (${message})`, returnCode, durationMs);
    }
    return false;
  }

  private async log(restaurantId: string, correlationId: string, ok: boolean, message: string, returnCode: number | null, durationMs: number) {
    await this.prisma.integrationLog.create({
      data: { restaurantId, kind: "TPAPI", operation: "Ping", correlationId, level: ok ? "INFO" : "ERROR", ok, returnCode, message, durationMs },
    });
  }
}
