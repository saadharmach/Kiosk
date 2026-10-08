import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STALE_SYNC_DAYS, buildAttention, type RestaurantFacts } from "../src/admin/attention.js";
import { OverviewService } from "../src/admin/overview.service.js";

const NOW = Date.parse("2026-10-01T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms);
const H = 3_600_000, D = 86_400_000;

const healthy = (over: Partial<RestaurantFacts> = {}): RestaurantFacts => ({
  id: "r1", slug: "resto", name: "Resto", status: "ACTIVE", activeOwners: 1, stuckOrders: 0, failedOrders: 0,
  tpapi: { isEnabled: true, lastSuccessAt: ago(H), lastFailureAt: null, lastSyncAt: ago(H), lastErrorMessage: null },
  ...over,
});
const kinds = (r: RestaurantFacts[]) => buildAttention(r, NOW).map((i) => i.kind);

describe("what needs the platform team's attention", () => {
  it("nothing, when a restaurant is healthy", () => assert.deepEqual(kinds([healthy()]), []));

  it("a till link whose last answer was a failure, with the reason", () => {
    const [i] = buildAttention([healthy({ tpapi: { isEnabled: true, lastSuccessAt: ago(2 * H), lastFailureAt: ago(H), lastSyncAt: ago(H), lastErrorMessage: "connect ECONNREFUSED" } })], NOW);
    assert.equal(i!.kind, "TILL_FAILING");
    assert.equal(i!.severity, "problem");
    assert.match(i!.message, /ECONNREFUSED/);
  });

  it("a failure that was followed by a success is over", () => {
    assert.deepEqual(kinds([healthy({ tpapi: { isEnabled: true, lastSuccessAt: ago(H), lastFailureAt: ago(2 * H), lastSyncAt: ago(H), lastErrorMessage: "old" } })]), []);
  });

  it("a failing till is reported once, not again as a stale or missing sync", () => {
    assert.deepEqual(kinds([healthy({ tpapi: { isEnabled: true, lastSuccessAt: null, lastFailureAt: ago(H), lastSyncAt: null, lastErrorMessage: null } })]), ["TILL_FAILING"]);
  });

  it("orders stuck on the way to the till, and orders that failed", () => {
    assert.deepEqual(kinds([healthy({ stuckOrders: 2, failedOrders: 1 })]).sort(), ["ORDERS_FAILED", "ORDERS_STUCK"]);
    assert.match(buildAttention([healthy({ stuckOrders: 1 })], NOW)[0]!.message, /^1 order has been waiting/);
    assert.match(buildAttention([healthy({ stuckOrders: 3 })], NOW)[0]!.message, /^3 orders have been waiting/);
  });

  it("nobody who can sign in to the back office", () => {
    assert.deepEqual(kinds([healthy({ activeOwners: 0 })]), ["NO_OWNER"]);
  });

  it("the menu is flagged once it is older than the limit, and not before", () => {
    const synced = (ms: number) => healthy({ tpapi: { isEnabled: true, lastSuccessAt: ago(H), lastFailureAt: null, lastSyncAt: ago(ms), lastErrorMessage: null } });
    assert.deepEqual(kinds([synced(STALE_SYNC_DAYS * D - H)]), []);
    assert.deepEqual(kinds([synced(STALE_SYNC_DAYS * D + H)]), ["STALE_SYNC"]);
    assert.match(buildAttention([synced(6 * D)], NOW)[0]!.message, /6 days ago/);
  });

  it("setup that is not finished: no till, switched off, menu never read", () => {
    assert.deepEqual(kinds([healthy({ tpapi: null })]), ["NO_TILL"]);
    assert.deepEqual(kinds([healthy({ tpapi: { isEnabled: false, lastSuccessAt: null, lastFailureAt: null, lastSyncAt: null, lastErrorMessage: null } })]), ["TILL_DISABLED"]);
    assert.deepEqual(kinds([healthy({ tpapi: { isEnabled: true, lastSuccessAt: ago(H), lastFailureAt: null, lastSyncAt: null, lastErrorMessage: null } })]), ["NEVER_SYNCED"]);
    for (const i of buildAttention([healthy({ tpapi: null })], NOW)) assert.equal(i.severity, "setup");
  });

  it("a restaurant that is switched off on purpose is never flagged", () => {
    for (const status of ["SUSPENDED", "ARCHIVED"] as const) {
      assert.deepEqual(kinds([healthy({ status, tpapi: null, activeOwners: 0, stuckOrders: 5, failedOrders: 5 })]), [], status);
    }
  });

  it("lists problems before warnings before setup, then by name", () => {
    const list = buildAttention([
      healthy({ id: "a", name: "Zed", tpapi: null }),                                             // setup
      healthy({ id: "b", name: "Bob", tpapi: { isEnabled: true, lastSuccessAt: ago(H), lastFailureAt: null, lastSyncAt: ago(5 * D), lastErrorMessage: null } }), // warning
      healthy({ id: "c", name: "Cat", activeOwners: 0 }),                                          // problem
      healthy({ id: "d", name: "Abe", stuckOrders: 1 }),                                           // problem
    ], NOW);
    assert.deepEqual(list.map((i) => `${i.severity}:${i.name}`), ["problem:Abe", "problem:Cat", "warning:Bob", "setup:Zed"]);
  });
});

describe("failing menu syncs", () => {
  const syncing = (n: number, why: string | null = "boom") => healthy({ syncFailures: n, lastSyncError: why });
  it("one or two failures in a row are a heads-up, three or more a problem, and the reason is shown", () => {
    const one = buildAttention([syncing(1)], NOW)[0]!;
    assert.deepEqual([one.kind, one.severity], ["SYNC_FAILING", "warning"]);
    assert.match(one.message, /last menu update from the till failed: boom/);
    assert.equal(buildAttention([syncing(2)], NOW)[0]!.severity, "warning");
    const many = buildAttention([syncing(3)], NOW)[0]!;
    assert.equal(many.severity, "problem");
    assert.match(many.message, /last 3 menu updates/);
  });
  it("is said once: a failing till or a stale menu is not reported again on top of it", () => {
    assert.deepEqual(kinds([healthy({ syncFailures: 4, tpapi: { isEnabled: true, lastSuccessAt: ago(H), lastFailureAt: null, lastSyncAt: ago(9 * D), lastErrorMessage: null } })]), ["SYNC_FAILING"]);
    assert.deepEqual(kinds([healthy({ syncFailures: 2, tpapi: { isEnabled: true, lastSuccessAt: ago(2 * H), lastFailureAt: ago(H), lastSyncAt: ago(H), lastErrorMessage: "down" } })]), ["TILL_FAILING"]);
  });
  it("nothing when the latest sync worked", () => assert.deepEqual(kinds([syncing(0)]), []));
});

describe("subscriptions on the overview", () => {
  it("none running: a problem that says the kiosks are off and where to fix it", () => {
    const [i] = buildAttention([healthy({ subscription: { state: "ended", coveredUntil: null, daysLeft: 0 } })], NOW);
    assert.equal(i!.kind, "SUBSCRIPTION_ENDED");
    assert.equal(i!.severity, "problem");
    assert.match(i!.message, /kiosks are not taking orders.*Subscription tab/);
  });
  it("ending within 7 days: a warning with the date; running: nothing", () => {
    const [i] = buildAttention([healthy({ subscription: { state: "ending", coveredUntil: "2026-10-31", daysLeft: 1 } })], NOW);
    assert.equal(i!.kind, "SUBSCRIPTION_ENDING");
    assert.equal(i!.severity, "warning");
    assert.match(i!.message, /ends on 2026-10-31 \(today is the last day\)/);
    assert.deepEqual(kinds([healthy({ subscription: { state: "active", coveredUntil: "2026-12-31", daysLeft: 60 } })]), []);
  });
  it("a suspended restaurant is not flagged for its subscription (it is off on purpose)", () => {
    assert.deepEqual(kinds([healthy({ status: "SUSPENDED", subscription: { state: "ended", coveredUntil: null, daysLeft: 0 } })]), []);
  });
});

describe("the overview endpoint's numbers", () => {
  function build() {
    const queries: { model: string; op: string; args: any }[] = [];
    const q = (model: string, op: string, result: unknown) => async (args: any) => { queries.push({ model, op, args }); return result; };
    const prisma = {
      restaurant: { findMany: q("restaurant", "findMany", [
        { id: "r1", slug: "a", name: "A", status: "ACTIVE", timezone: "UTC", subscriptionPeriods: [{ id: "s", startsOn: new Date("2020-01-01T00:00:00Z"), endsOn: new Date("2099-12-31T00:00:00Z"), cancelledAt: null }], tpapi: { isEnabled: true, lastSuccessAt: ago(H), lastFailureAt: null, lastSyncAt: ago(H), lastErrorMessage: null } },
        { id: "r2", slug: "b", name: "B", status: "SUSPENDED", timezone: "UTC", subscriptionPeriods: [], tpapi: null },
        { id: "r3", slug: "c", name: "C", status: "ACTIVE", timezone: "UTC", subscriptionPeriods: [{ id: "old", startsOn: new Date("2026-01-01T00:00:00Z"), endsOn: new Date("2026-02-01T00:00:00Z"), cancelledAt: null }], tpapi: null },
      ]) },
      restaurantUser: {
        groupBy: q("restaurantUser", "groupBy", [{ restaurantId: "r1", _count: { _all: 1 } }]),
        findMany: q("restaurantUser", "findMany", []),
      },
      order: {
        groupBy: async (args: any) => {
          queries.push({ model: "order", op: "groupBy", args });
          return args.where.status === "FAILED" ? [{ restaurantId: "r1", _count: { _all: 2 } }] : [{ restaurantId: "r1", _count: { _all: 1 } }];
        },
        count: async (args: any) => { queries.push({ model: "order", op: "count", args }); return args.where.createdAt.gte.getTime() === NOW - D ? 12 : 80; },
      },
      syncRun: { findMany: q("syncRun", "findMany", []) },
      auditLog: { findMany: q("auditLog", "findMany", [
        { id: "a1", createdAt: ago(H), restaurantId: "r1", actorType: "PLATFORM_USER", actorId: "p1", actorLabel: null, action: "restaurant.update" },
      ]) },
      platformUser: { findMany: q("platformUser", "findMany", [{ id: "p1", email: "boss@x.test" }]) },
    };
    return { svc: new OverviewService(prisma as never), queries };
  }

  it("counts restaurants by status, orders over 24 hours and 7 days, and flags what is wrong", async () => {
    const { svc } = build();
    const o = await svc.get(NOW);
    assert.deepEqual(o.restaurants, { ACTIVE: 2, SUSPENDED: 1, ARCHIVED: 0, total: 3 });
    assert.deepEqual(o.orders, { last24h: 12, last7d: 80 });
    const byKind = o.attention.map((i) => `${i.slug}:${i.kind}`).sort();
    // r2 is suspended on purpose, so nothing is said about it
    assert.deepEqual(byKind, ["a:ORDERS_FAILED", "a:ORDERS_STUCK", "c:NO_OWNER", "c:NO_TILL", "c:SUBSCRIPTION_ENDED"]);
    assert.equal(o.recentActivity[0]!.restaurant, "A");
    assert.equal(o.recentActivity[0]!.actor, "boss@x.test");
  });

  it("only counts orders that were really placed, and only recent ones as stuck", async () => {
    const { svc, queries } = build();
    await svc.get(NOW);
    const counts = queries.filter((q) => q.op === "count");
    for (const c of counts) assert.deepEqual([...c.args.where.status.in].sort(), ["CONFIRMED", "PAID", "PENDING", "SENT"]);
    const stuck = queries.find((q) => q.op === "groupBy" && q.model === "order" && Array.isArray(q.args.where.status?.in))!;
    assert.deepEqual(stuck.args.where.status.in, ["PENDING", "SENT"]);
    assert.equal(stuck.args.where.createdAt.lt.getTime(), NOW - 10 * 60_000);
    assert.equal(stuck.args.where.createdAt.gte.getTime(), NOW - 3 * D);
  });
});
