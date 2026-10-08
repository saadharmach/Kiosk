import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Request } from "express";
import { AuditService } from "../common/audit.service.js";
import { overlaps, parseDay, periodState, standing, todayIn, ymd, type PeriodRow } from "../common/subscription.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { AddPeriodDto, ChangePeriodDto } from "./dto/subscription.dto.js";

/** Dates outside this are a typo, not a subscription. */
const EARLIEST = "2020-01-01";
const LATEST = "2100-12-31";

/**
 * The platform team chooses each restaurant's subscription periods: from a day to a day, renewed by adding the next
 * one, cancelled at any time (from that moment the period no longer counts). Every change is in the audit log.
 */
@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async restaurant(id: string) {
    const r = await this.prisma.restaurant.findUnique({ where: { id }, select: { id: true, timezone: true, currency: true } });
    if (!r) throw new NotFoundException("Restaurant not found");
    return r;
  }

  async get(restaurantId: string, now = new Date()) {
    const r = await this.restaurant(restaurantId);
    const periods = await this.prisma.subscriptionPeriod.findMany({ where: { restaurantId }, orderBy: { startsOn: "desc" } });
    const today = todayIn(r.timezone, now);
    const s = standing(periods, today);
    return {
      today: ymd(today),
      currency: r.currency,
      standing: {
        state: s.state,
        coveredUntil: s.coveredUntil ? ymd(s.coveredUntil) : null,
        daysLeft: s.daysLeft,
        next: s.next ? { startsOn: ymd(s.next.startsOn), endsOn: ymd(s.next.endsOn) } : null,
      },
      periods: periods.map((p) => ({
        id: p.id,
        startsOn: ymd(p.startsOn),
        endsOn: ymd(p.endsOn),
        amount: p.amount === null ? null : Number(p.amount),
        note: p.note,
        state: periodState(p, today),
        createdAt: p.createdAt,
        cancelledAt: p.cancelledAt,
        cancelReason: p.cancelReason,
      })),
    };
  }

  /** Both days must be real, in order, and not overlap another period still counting. */
  private async checkDates(restaurantId: string, startsOn: Date, endsOn: Date, exceptId?: string) {
    if (endsOn < startsOn) throw new BadRequestException("The last day is before the first day.");
    if (ymd(startsOn) < EARLIEST || ymd(endsOn) > LATEST) throw new BadRequestException(`Dates must be between ${EARLIEST} and ${LATEST}.`);
    const others = await this.prisma.subscriptionPeriod.findMany({
      where: { restaurantId, cancelledAt: null, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { startsOn: true, endsOn: true },
    });
    const clash = others.find((o) => overlaps(o, { startsOn, endsOn }));
    if (clash) {
      throw new ConflictException(`These dates overlap the period ${ymd(clash.startsOn)} to ${ymd(clash.endsOn)}. Change that one, or start after ${ymd(clash.endsOn)}.`);
    }
  }

  private day(s: string, which: string): Date {
    const d = parseDay(s);
    if (!d) throw new BadRequestException(`${which} is not a real day: ${s}`);
    return d;
  }

  async add(restaurantId: string, dto: AddPeriodDto, actor: { id: string }, req?: Request) {
    await this.restaurant(restaurantId);
    const startsOn = this.day(dto.startsOn, "The first day");
    const endsOn = this.day(dto.endsOn, "The last day");
    await this.checkDates(restaurantId, startsOn, endsOn);
    const p = await this.prisma.subscriptionPeriod.create({
      data: {
        restaurantId, startsOn, endsOn, createdById: actor.id,
        amount: dto.amount === undefined || dto.amount === null ? null : new Prisma.Decimal(dto.amount),
        note: dto.note?.trim() || null,
      },
    });
    await this.audit.record({
      restaurantId, actorType: "PLATFORM_USER", actorId: actor.id, action: "subscription.period_added",
      entityType: "SubscriptionPeriod", entityId: p.id, after: { startsOn: dto.startsOn, endsOn: dto.endsOn, amount: dto.amount ?? null, note: p.note },
    }, req);
    return this.get(restaurantId);
  }

  private async period(restaurantId: string, periodId: string) {
    // Scoped by the restaurant: another restaurant's period is "not found", never touched.
    const p = await this.prisma.subscriptionPeriod.findFirst({ where: { id: periodId, restaurantId } });
    if (!p) throw new NotFoundException("Subscription period not found");
    return p;
  }

  async change(restaurantId: string, periodId: string, dto: ChangePeriodDto, actor: { id: string }, req?: Request) {
    const p = await this.period(restaurantId, periodId);
    if (p.cancelledAt) throw new ConflictException("This period was cancelled; add a new one instead.");
    const startsOn = dto.startsOn !== undefined ? this.day(dto.startsOn, "The first day") : p.startsOn;
    const endsOn = dto.endsOn !== undefined ? this.day(dto.endsOn, "The last day") : p.endsOn;
    await this.checkDates(restaurantId, startsOn, endsOn, p.id);
    const data: Prisma.SubscriptionPeriodUpdateManyMutationInput = { startsOn, endsOn };
    if (dto.amount !== undefined) data.amount = dto.amount === null ? null : new Prisma.Decimal(dto.amount);
    if (dto.note !== undefined) data.note = dto.note?.trim() || null;
    await this.prisma.subscriptionPeriod.updateMany({ where: { id: p.id, restaurantId }, data });
    await this.audit.record({
      restaurantId, actorType: "PLATFORM_USER", actorId: actor.id, action: "subscription.period_changed", entityType: "SubscriptionPeriod", entityId: p.id,
      before: { startsOn: ymd(p.startsOn), endsOn: ymd(p.endsOn), amount: p.amount === null ? null : Number(p.amount), note: p.note },
      after: { startsOn: ymd(startsOn), endsOn: ymd(endsOn), ...(dto.amount !== undefined ? { amount: dto.amount } : {}), ...(dto.note !== undefined ? { note: data.note } : {}) },
    }, req);
    return this.get(restaurantId);
  }

  /** Ends it now: from this moment the period no longer counts (a period still to come is simply called off). */
  async cancel(restaurantId: string, periodId: string, reason: string | undefined, actor: { id: string }, req?: Request, now = new Date()) {
    const r = await this.restaurant(restaurantId);
    const p = await this.period(restaurantId, periodId);
    if (p.cancelledAt) throw new ConflictException("This period is already cancelled.");
    if (periodState(p, todayIn(r.timezone, now)) === "past") throw new ConflictException("This period is already over.");
    await this.prisma.subscriptionPeriod.updateMany({
      where: { id: p.id, restaurantId, cancelledAt: null },
      data: { cancelledAt: now, cancelledById: actor.id, cancelReason: reason?.trim() || null },
    });
    await this.audit.record({
      restaurantId, actorType: "PLATFORM_USER", actorId: actor.id, action: "subscription.period_cancelled", entityType: "SubscriptionPeriod", entityId: p.id,
      before: { startsOn: ymd(p.startsOn), endsOn: ymd(p.endsOn) }, after: { cancelledAt: now.toISOString(), reason: reason?.trim() || null },
    }, req);
    return this.get(restaurantId);
  }
}

