/**
 * Subscriptions are periods the platform team chooses (from a date to a date, both included). A restaurant's kiosks
 * take orders while one of its periods is running and has not been cancelled. Dates are days in the restaurant's
 * own time zone, stored as DATE (a JS Date at UTC midnight).
 */

/** How many days before the end the restaurant (and the platform team) is warned. */
export const ENDING_SOON_DAYS = 7;
const DAY = 86_400_000;

export interface PeriodRow {
  id: string;
  startsOn: Date;
  endsOn: Date;
  cancelledAt: Date | null;
}

export type PeriodState = "current" | "upcoming" | "past" | "cancelled";

/** Today in that time zone, as a DATE value (UTC midnight), the same shape the database gives back. */
export function todayIn(timeZone: string, now = new Date()): Date {
  let ymd: string;
  try {
    ymd = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  }
  return new Date(`${ymd}T00:00:00.000Z`);
}

/** "2026-10-31" from a DATE value. */
export const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** A "YYYY-MM-DD" from a form, as a DATE value; null when it is not a real day. */
export function parseDay(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || ymd(d) !== s ? null : d;
}

export function periodState(p: PeriodRow, today: Date): PeriodState {
  if (p.cancelledAt) return "cancelled";
  if (p.endsOn < today) return "past";
  if (p.startsOn > today) return "upcoming";
  return "current";
}

/** Days from today to the last covered day, counting today: ends today = 1. */
export const daysLeft = (endsOn: Date, today: Date) => Math.round((endsOn.getTime() - today.getTime()) / DAY) + 1;

/**
 * Where a restaurant stands. "active": a period is running. "ending": it ends within ENDING_SOON_DAYS and nothing
 * follows straight after. "ended": none running, but there was one. "none": never had one.
 */
export function standing(periods: PeriodRow[], today: Date) {
  const live = periods.filter((p) => !p.cancelledAt);
  const current = live.filter((p) => periodState(p, today) === "current").sort((a, b) => +b.endsOn - +a.endsOn)[0] ?? null;
  const next = live.filter((p) => periodState(p, today) === "upcoming").sort((a, b) => +a.startsOn - +b.startsOn)[0] ?? null;
  if (current) {
    // The last day covered without a gap: a period that follows on directly counts as one longer stretch.
    let coveredUntil = current.endsOn;
    for (const p of live.filter((x) => x.startsOn > current.startsOn).sort((a, b) => +a.startsOn - +b.startsOn)) {
      if (p.startsOn.getTime() <= coveredUntil.getTime() + DAY && p.endsOn > coveredUntil) coveredUntil = p.endsOn;
    }
    const left = daysLeft(coveredUntil, today);
    return { state: left <= ENDING_SOON_DAYS ? ("ending" as const) : ("active" as const), coveredUntil, daysLeft: left, next };
  }
  const lastEnd = periods.reduce<Date | null>((m, p) => {
    const end = p.cancelledAt && p.cancelledAt < p.endsOn ? p.cancelledAt : p.endsOn;
    return !m || end > m ? end : m;
  }, null);
  return { state: periods.length ? ("ended" as const) : ("none" as const), coveredUntil: null, daysLeft: 0, next, endedOn: lastEnd };
}

/** Two periods share at least one day. */
export const overlaps = (a: { startsOn: Date; endsOn: Date }, b: { startsOn: Date; endsOn: Date }) =>
  a.startsOn <= b.endsOn && b.startsOn <= a.endsOn;

/** Does the restaurant have a running period now? One small indexed query. */
export async function isSubscribed(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the Prisma client, or a test's stand-in
  prisma: { subscriptionPeriod: { findFirst: (a: any) => Promise<unknown> } },
  restaurantId: string,
  timeZone: string,
  now = new Date(),
): Promise<boolean> {
  const today = todayIn(timeZone, now);
  const row = await prisma.subscriptionPeriod.findFirst({
    where: { restaurantId, cancelledAt: null, startsOn: { lte: today }, endsOn: { gte: today } },
    select: { id: true },
  });
  return Boolean(row);
}
