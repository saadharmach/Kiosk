import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { daysLeft, isSubscribed, overlaps, parseDay, periodState, standing, todayIn } from "../src/common/subscription.js";

const D = (s: string) => new Date(`${s}T00:00:00.000Z`);
const p = (id: string, from: string, to: string, cancelledAt: Date | null = null) => ({ id, startsOn: D(from), endsOn: D(to), cancelledAt });

describe("today, in the restaurant's own time zone", () => {
  // Tokyo: UTC+9 all year (no daylight saving), so the day changes at 15:00 UTC. (Morocco's own offset is decided by
  // decree and has moved over the years: the code asks the time zone database, the test uses a zone that never moves.)
  it("the day changes at the restaurant's midnight, not at UTC midnight", () => {
    assert.equal(todayIn("Asia/Tokyo", new Date("2026-10-31T15:30:00Z")).toISOString(), "2026-11-01T00:00:00.000Z");
    assert.equal(todayIn("Asia/Tokyo", new Date("2026-10-31T14:30:00Z")).toISOString(), "2026-10-31T00:00:00.000Z");
    assert.equal(todayIn("UTC", new Date("2026-10-31T23:30:00Z")).toISOString(), "2026-10-31T00:00:00.000Z");
  });
  it("an unknown time zone falls back to UTC instead of failing", () => {
    assert.equal(todayIn("Not/AZone", new Date("2026-10-08T10:00:00Z")).toISOString(), "2026-10-08T00:00:00.000Z");
  });
  it("only real days are accepted from a form", () => {
    assert.equal(parseDay("2026-02-28")?.toISOString(), "2026-02-28T00:00:00.000Z");
    for (const bad of ["2026-02-30", "2026-13-01", "31/10/2026", "", "2026-10-8"]) assert.equal(parseDay(bad), null, bad);
  });
});

describe("periods", () => {
  const today = D("2026-10-15");
  it("current, upcoming, past, cancelled; both ends of a period count", () => {
    assert.equal(periodState(p("a", "2026-10-01", "2026-10-15"), today), "current", "its last day still counts");
    assert.equal(periodState(p("a", "2026-10-15", "2026-11-15"), today), "current", "its first day counts");
    assert.equal(periodState(p("a", "2026-10-16", "2026-11-15"), today), "upcoming");
    assert.equal(periodState(p("a", "2026-09-01", "2026-10-14"), today), "past");
    assert.equal(periodState(p("a", "2026-10-01", "2026-12-31", new Date()), today), "cancelled");
  });
  it("days left counts today: a period ending today has 1 day left", () => {
    assert.equal(daysLeft(D("2026-10-15"), today), 1);
    assert.equal(daysLeft(D("2026-10-21"), today), 7);
  });
  it("two periods overlap when they share even one day", () => {
    assert.equal(overlaps(p("a", "2026-10-01", "2026-10-31"), p("b", "2026-10-31", "2026-11-30")), true);
    assert.equal(overlaps(p("a", "2026-10-01", "2026-10-31"), p("b", "2026-11-01", "2026-11-30")), false);
  });
});

describe("where a restaurant stands", () => {
  const today = D("2026-10-25");
  it("running with more than 7 days left: active", () => {
    const s = standing([p("a", "2026-10-01", "2026-12-31")], today);
    assert.equal(s.state, "active");
    assert.equal(s.daysLeft, 68);
  });
  it("7 days or fewer left: ending", () => {
    const s = standing([p("a", "2026-10-01", "2026-10-31")], today);
    assert.deepEqual([s.state, s.daysLeft], ["ending", 7]);
  });
  it("a renewal that follows straight on is not 'ending': it counts to the end of the renewal", () => {
    const s = standing([p("a", "2026-10-01", "2026-10-31"), p("b", "2026-11-01", "2026-11-30")], today);
    assert.equal(s.state, "active");
    assert.equal(s.coveredUntil?.toISOString().slice(0, 10), "2026-11-30");
  });
  it("a renewal after a gap does not count as covered, but is shown as next", () => {
    const s = standing([p("a", "2026-10-01", "2026-10-31"), p("b", "2026-11-05", "2026-11-30")], today);
    assert.equal(s.state, "ending");
    assert.equal(s.next?.id, "b");
  });
  it("cancelled: ended at once, even with days left", () => {
    const s = standing([p("a", "2026-10-01", "2026-12-31", new Date("2026-10-20T10:00:00Z"))], today);
    assert.equal(s.state, "ended");
  });
  it("never had one: none; only past ones: ended", () => {
    assert.equal(standing([], today).state, "none");
    assert.equal(standing([p("a", "2026-09-01", "2026-09-30")], today).state, "ended");
  });
});

describe("the one check the kiosk routes make", () => {
  it("asks for a running, not cancelled period of this restaurant, for today in its own time zone", async () => {
    let where: any;
    const prisma = { subscriptionPeriod: { findFirst: async (a: any) => { where = a.where; return { id: "x" }; } } };
    assert.equal(await isSubscribed(prisma, "r1", "Asia/Tokyo", new Date("2026-10-31T15:30:00Z")), true);
    assert.equal(where.restaurantId, "r1");
    assert.equal(where.cancelledAt, null);
    assert.equal(where.startsOn.lte.toISOString(), "2026-11-01T00:00:00.000Z");
    assert.equal(where.endsOn.gte.toISOString(), "2026-11-01T00:00:00.000Z");
    assert.equal(await isSubscribed({ subscriptionPeriod: { findFirst: async () => null } }, "r1", "UTC"), false);
  });
});
