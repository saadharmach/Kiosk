import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SubscriptionsService } from "../src/admin/subscriptions.service.js";

const R = "11111111-1111-4111-8111-111111111111";
const D = (s: string) => new Date(`${s}T00:00:00.000Z`);
const NOW = new Date("2026-10-15T10:00:00Z");

function setup(periods: any[] = []) {
  const rows = periods.map((p, i) => ({ id: `p${i + 1}`, restaurantId: R, amount: null, note: null, createdAt: NOW, cancelledAt: null, cancelReason: null, ...p, startsOn: D(p.startsOn), endsOn: D(p.endsOn) }));
  const audits: any[] = [];
  const calls: any[] = [];
  const match = (r: any, w: any) => r.restaurantId === w.restaurantId
    && (w.id === undefined || (typeof w.id === "object" ? r.id !== w.id.not : r.id === w.id))
    && (w.cancelledAt === undefined || r.cancelledAt === w.cancelledAt);
  const prisma: any = {
    restaurant: { findUnique: async (a: any) => (a.where.id === R ? { id: R, timezone: "UTC", currency: "MAD" } : null) },
    subscriptionPeriod: {
      findMany: async (a: any) => { calls.push({ op: "findMany", where: a.where }); return rows.filter((r) => match(r, a.where)).map((r) => ({ ...r })); },
      findFirst: async (a: any) => { calls.push({ op: "findFirst", where: a.where }); const r = rows.find((x) => match(x, a.where)); return r ? { ...r } : null; },
      create: async (a: any) => { calls.push({ op: "create", data: a.data }); const r = { id: `p${rows.length + 1}`, createdAt: NOW, cancelledAt: null, cancelReason: null, ...a.data }; rows.push(r); return r; },
      updateMany: async (a: any) => { calls.push({ op: "updateMany", where: a.where, data: a.data }); for (const r of rows) if (match(r, a.where)) Object.assign(r, a.data); return { count: 1 }; },
    },
  };
  const audit = { record: async (e: any) => { audits.push(e); } };
  return { svc: new SubscriptionsService(prisma, audit as never), rows, audits, calls };
}
const actor = { id: "admin-1" };

describe("the platform team sets the periods", () => {
  it("adds a period from a day to a day, with an amount and a note; it is in the audit log", async () => {
    const { svc, rows, audits } = setup();
    const r = await svc.add(R, { startsOn: "2026-11-01", endsOn: "2026-11-30", amount: 1200, note: " paid cash " }, actor);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].note, "paid cash");
    assert.equal(Number(rows[0].amount), 1200);
    assert.equal(rows[0].createdById, "admin-1");
    assert.deepEqual(r.periods.map((p) => [p.startsOn, p.endsOn, p.state]), [["2026-11-01", "2026-11-30", "upcoming"]]);
    assert.equal(audits[0].action, "subscription.period_added");
  });

  it("refuses the last day before the first, days that do not exist, and typo years", async () => {
    const { svc } = setup();
    await assert.rejects(svc.add(R, { startsOn: "2026-11-30", endsOn: "2026-11-01" }, actor), /before the first day/);
    await assert.rejects(svc.add(R, { startsOn: "2026-02-30", endsOn: "2026-03-30" }, actor), /not a real day/);
    await assert.rejects(svc.add(R, { startsOn: "2206-01-01", endsOn: "2206-02-01" }, actor), /between 2020-01-01 and 2100-12-31/);
  });

  it("refuses dates that overlap a period still counting, and says which one; a cancelled one does not block", async () => {
    const { svc } = setup([{ startsOn: "2026-10-01", endsOn: "2026-10-31" }, { startsOn: "2026-12-01", endsOn: "2026-12-31", cancelledAt: NOW }]);
    await assert.rejects(svc.add(R, { startsOn: "2026-10-31", endsOn: "2026-11-30" }, actor), /overlap the period 2026-10-01 to 2026-10-31/);
    await assert.doesNotReject(svc.add(R, { startsOn: "2026-11-01", endsOn: "2026-11-30" }, actor), "starting the next day is fine");
    await assert.doesNotReject(svc.add(R, { startsOn: "2026-12-01", endsOn: "2026-12-31" }, actor), "over a cancelled one is fine");
  });

  it("changes a period's end (an extension) and records before and after", async () => {
    const { svc, rows, audits } = setup([{ startsOn: "2026-10-01", endsOn: "2026-10-31" }]);
    const r = await svc.change(R, "p1", { endsOn: "2026-12-31" }, actor);
    assert.equal(rows[0].endsOn.toISOString().slice(0, 10), "2026-12-31");
    assert.equal(r.standing.state, "active");
    assert.deepEqual([audits[0].before.endsOn, audits[0].after.endsOn], ["2026-10-31", "2026-12-31"]);
  });

  it("cancels at once: from that moment it no longer counts; the reason is kept", async () => {
    const { svc, rows, audits } = setup([{ startsOn: "2026-10-01", endsOn: "2026-12-31" }]);
    const r = await svc.cancel(R, "p1", " stopped paying ", actor, undefined, NOW);
    assert.equal(rows[0].cancelledAt, NOW);
    assert.equal(rows[0].cancelReason, "stopped paying");
    assert.equal(rows[0].cancelledById, "admin-1");
    assert.equal(r.standing.state, "ended");
    assert.equal(r.periods[0]!.state, "cancelled");
    assert.equal(audits[0].action, "subscription.period_cancelled");
  });

  it("cannot cancel twice, cancel what is already over, or change a cancelled period", async () => {
    const a = setup([{ startsOn: "2026-10-01", endsOn: "2026-12-31", cancelledAt: NOW }]);
    await assert.rejects(a.svc.cancel(R, "p1", undefined, actor, undefined, NOW), /already cancelled/);
    await assert.rejects(a.svc.change(R, "p1", { endsOn: "2027-01-31" }, actor), /was cancelled/);
    const b = setup([{ startsOn: "2026-09-01", endsOn: "2026-09-30" }]);
    await assert.rejects(b.svc.cancel(R, "p1", undefined, actor, undefined, NOW), /already over/);
  });

  it("another restaurant's period is not found, and every query carries this restaurant", async () => {
    const { svc, calls } = setup([{ startsOn: "2026-10-01", endsOn: "2026-12-31", restaurantId: "other" }]);
    await assert.rejects(svc.cancel(R, "p1", undefined, actor, undefined, NOW), /not found/);
    await assert.rejects(svc.change(R, "p1", { endsOn: "2027-01-31" }, actor), /not found/);
    await assert.rejects(svc.get("22222222-2222-4222-8222-222222222222"), /Restaurant not found/);
    for (const c of calls) if (c.where) assert.equal(c.where.restaurantId, R, c.op);
  });
});
