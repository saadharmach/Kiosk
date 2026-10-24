import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { DashboardController, ONLINE_WITHIN_MS } from "../src/restaurant/dashboard.controller.js";
import { HEARTBEAT_EVERY_MS, noteHeartbeat } from "../src/kiosk/screen.js";
import { D } from "./helpers/fake-prisma.js";

const SECRET = "ksc_" + "a".repeat(30);

describe("a registered screen checks in", () => {
  const capture = () => {
    const calls: unknown[] = [];
    return { calls, prisma: { kiosk: { updateMany: async (a: unknown) => { calls.push(a); return { count: 1 }; } } } };
  };

  it("marks its own borne seen, in this restaurant only, at most once a minute", async () => {
    const { calls, prisma } = capture();
    const now = new Date("2026-10-24T10:00:00Z");
    await noteHeartbeat(prisma, "r1", SECRET, now);
    assert.deepEqual(calls, [{
      where: {
        restaurantId: "r1",
        tokenHash: createHash("sha256").update(SECRET).digest("hex"),
        tokenRevokedAt: null,
        OR: [{ lastHeartbeatAt: null }, { lastHeartbeatAt: { lt: new Date(now.getTime() - HEARTBEAT_EVERY_MS) } }],
      },
      data: { lastHeartbeatAt: now },
    }]);
  });

  it("a screen with no secret, or a malformed one, writes nothing", async () => {
    const { calls, prisma } = capture();
    for (const s of [undefined, null, "", "nope", "ksc_short"]) await noteHeartbeat(prisma, "r1", s);
    assert.equal(calls.length, 0);
  });
});

describe("the back office dashboard", () => {
  const now = Date.now();
  const kiosk = (code: string, over: Record<string, unknown> = {}) =>
    ({ code, name: `Borne ${code}`, isEnabled: true, tokenHash: "h" + code, tokenRevokedAt: null, lastHeartbeatAt: new Date(now - 10_000), ...over });

  function setup(kiosks: Record<string, unknown>[]) {
    const wheres: Record<string, unknown> = {};
    const prisma = {
      restaurant: { findUniqueOrThrow: async () => ({ timezone: "UTC", currency: "MAD", tpapi: { isEnabled: true, lastSyncAt: new Date("2026-10-24T09:00:00Z"), pingFailures: 0 } }) },
      kiosk: { findMany: async (a: { where: unknown }) => { wheres.kiosk = a.where; return kiosks; } },
      order: {
        aggregate: async (a: { where: unknown }) => { wheres.aggregate = a.where; return { _count: { _all: 3 }, _sum: { total: D(84.5) } }; },
        findMany: async (a: { where: unknown }) => {
          wheres.orders = a.where;
          return [{ reference: "K1-1024-003", status: "PAID", total: D(30), orderType: "EAT_IN", createdAt: new Date("2026-10-24T09:30:00Z") }];
        },
      },
      syncRun: { findFirst: async (a: { where: unknown }) => { wheres.sync = a.where; return { status: "SUCCEEDED", finishedAt: new Date("2026-10-24T09:00:00Z"), errorMessage: null }; } },
    };
    return { ctl: new DashboardController(prisma as never), wheres };
  }

  it("counts the bornes, which registered ones are on line, and today's sales", async () => {
    const { ctl, wheres } = setup([
      kiosk("K1"),
      kiosk("K2", { lastHeartbeatAt: new Date(now - ONLINE_WITHIN_MS - 1000) }),
      kiosk("K3", { tokenHash: null, lastHeartbeatAt: null }),
      kiosk("K4", { isEnabled: false }),
    ]);
    const d = await ctl.get({ restaurantId: "r1", slug: "resto-a" });
    assert.deepEqual([d.bornes.configured, d.bornes.online, d.bornes.offline], [3, 1, 1], "a switched-off borne is not counted; an unregistered one has no state");
    assert.deepEqual(d.bornes.list.map((b) => [b.code, b.registered, b.online]), [["K1", true, true], ["K2", true, false], ["K3", false, false], ["K4", true, false]]);
    assert.deepEqual(d.orders, { count: 3, revenue: 84.5 });
    assert.equal(d.recentOrders[0]!.reference, "K1-1024-003");
    assert.deepEqual(d.till, { reachable: true, lastSyncAt: "2026-10-24T09:00:00.000Z" });
    for (const [k, w] of Object.entries(wheres)) assert.equal((w as { restaurantId: string }).restaurantId, "r1", k);
  });

  it("with no registered screen, on line and off line are unknown (null), not zero", async () => {
    const { ctl } = setup([kiosk("K1", { tokenHash: null }), kiosk("K2", { tokenHash: null })]);
    const d = await ctl.get({ restaurantId: "r1", slug: "resto-a" });
    assert.deepEqual([d.bornes.configured, d.bornes.online, d.bornes.offline], [2, null, null]);
  });
});
