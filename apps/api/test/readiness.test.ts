import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NotFoundException } from "@nestjs/common";
import { isOrderTypeConfigured } from "../src/common/order-type-config.js";
import { evaluateReadiness, type CheckKey, type ReadinessFacts } from "../src/admin/readiness.js";
import { ReadinessService } from "../src/admin/readiness.service.js";
import { model, type Call } from "./helpers/fake-prisma.js";

const NOW = Date.parse("2026-10-01T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms);
const H = 3_600_000, D = 86_400_000;

/** A restaurant that is completely ready. Each test spoils one thing. */
const ready = (over: Partial<ReadinessFacts> = {}): ReadinessFacts => ({
  status: "ACTIVE",
  subscription: { state: "active", coveredUntil: "2026-12-31", daysLeft: 80 },
  till: { isEnabled: true, hasCredentials: true, lastSuccessAt: ago(H), lastFailureAt: null, lastErrorMessage: null, lastSyncAt: ago(H) },
  menu: { departments: 5, articles: 120, prices: 118 },
  orderTypes: [{ type: "EAT_IN", configured: true }],
  activeOwners: 1,
  printer: { enabled: true, hasAddress: true, helperIssued: true, helperOnline: true },
  hasLogo: true,
  placedOrders: 3,
  ...over,
});
const get = (f: ReadinessFacts, key: CheckKey) => evaluateReadiness(f, NOW).checks.find((c) => c.key === key)!;

describe("the go-live checklist", () => {
  it("a restaurant with everything in place is ready, with every check done", () => {
    const r = evaluateReadiness(ready(), NOW);
    assert.equal(r.ready, true);
    assert.deepEqual(r.checks.map((c) => c.state), Array(9).fill("done"));
    assert.deepEqual([r.requiredDone, r.requiredTotal, r.recommendedDone, r.recommendedTotal], [6, 6, 3, 3]);
  });

  it("a brand-new restaurant is not ready, and says what is missing, in order", () => {
    const r = evaluateReadiness(ready({ subscription: { state: "none", coveredUntil: null, daysLeft: 0 }, till: null, menu: { departments: 0, articles: 0, prices: 0 }, orderTypes: [{ type: "EAT_IN", configured: false }], activeOwners: 0, printer: null, hasLogo: false, placedOrders: 0 }), NOW);
    assert.equal(r.ready, false);
    assert.deepEqual(r.checks.filter((c) => c.state === "todo").map((c) => c.key), ["SUBSCRIPTION", "TILL", "MENU", "ORDER_TYPES", "OWNER", "PRINTER", "LOGO", "TEST_ORDER"]);
    assert.equal(r.requiredDone, 1);   // only "active"
  });

  it("recommended checks never block going live", () => {
    const r = evaluateReadiness(ready({ printer: null, hasLogo: false, placedOrders: 0 }), NOW);
    assert.equal(r.ready, true);
    assert.equal(r.recommendedDone, 0);
  });

  it("a suspended or archived restaurant is not ready", () => {
    for (const status of ["SUSPENDED", "ARCHIVED"] as const) {
      const c = get(ready({ status }), "ACTIVE");
      assert.equal(c.state, "todo");
      assert.match(c.detail, new RegExp(status.toLowerCase()));
    }
  });

  describe("the till link", () => {
    const till = (over: Partial<NonNullable<ReadinessFacts["till"]>>) => ready({ till: { ...ready().till!, ...over } });
    it("none, no credentials, switched off, never tested", () => {
      assert.match(get(ready({ till: null }), "TILL").detail, /No unTill connection/);
      assert.match(get(till({ hasCredentials: false }), "TILL").detail, /no credentials/);
      assert.match(get(till({ isEnabled: false }), "TILL").detail, /switched off/);
      assert.match(get(till({ lastSuccessAt: null }), "TILL").detail, /never tested/);
      for (const f of [ready({ till: null }), till({ hasCredentials: false }), till({ isEnabled: false }), till({ lastSuccessAt: null })]) assert.equal(get(f, "TILL").state, "todo");
    });
    it("a failure after the last success blocks, with the reason; a success after a failure is fine", () => {
      const failing = get(till({ lastSuccessAt: ago(2 * H), lastFailureAt: ago(H), lastErrorMessage: "ECONNREFUSED" }), "TILL");
      assert.equal(failing.state, "todo");
      assert.match(failing.detail, /ECONNREFUSED/);
      assert.equal(get(till({ lastSuccessAt: ago(H), lastFailureAt: ago(2 * H) }), "TILL").state, "done");
    });
    it("can be fixed on the unTill tab", () => assert.equal(get(ready({ till: null }), "TILL").tab, "unTill"));
  });

  describe("the menu", () => {
    it("not read yet, empty, or without prices", () => {
      assert.equal(get(ready({ till: { ...ready().till!, lastSyncAt: null } }), "MENU").state, "todo");
      assert.match(get(ready({ menu: { departments: 5, articles: 0, prices: 0 } }), "MENU").detail, /empty/);
      assert.match(get(ready({ menu: { departments: 0, articles: 9, prices: 9 } }), "MENU").detail, /empty/);
      assert.match(get(ready({ menu: { departments: 5, articles: 9, prices: 0 } }), "MENU").detail, /no prices/);
    });
    it("an old menu is a warning, not a blocker", () => {
      const f = ready({ till: { ...ready().till!, lastSyncAt: ago(5 * D) } });
      const c = get(f, "MENU");
      assert.equal(c.state, "warning");
      assert.match(c.detail, /5 days ago/);
      assert.equal(evaluateReadiness(f, NOW).ready, true);
    });
  });

  describe("the subscription", () => {
    it("running: done; ending within 7 days: a warning to add the next period; none or ended: blocks, and points to its tab", () => {
      assert.equal(get(ready(), "SUBSCRIPTION").state, "done");
      const ending = get(ready({ subscription: { state: "ending", coveredUntil: "2026-10-31", daysLeft: 3 } }), "SUBSCRIPTION");
      assert.equal(ending.state, "warning");
      assert.match(ending.detail, /Ends on 2026-10-31 \(in 3 days\)/);
      for (const state of ["ended", "none"] as const) {
        const r = evaluateReadiness(ready({ subscription: { state, coveredUntil: null, daysLeft: 0 } }), NOW);
        assert.equal(r.ready, false, state);
        const c = r.checks.find((x) => x.key === "SUBSCRIPTION")!;
        assert.equal(c.state, "todo");
        assert.equal(c.tab, "Subscription");
      }
    });
  });

  describe("ways of ordering", () => {
    it("none switched on, or none set up: blocked, and the restaurant is told where to fix it", () => {
      assert.equal(get(ready({ orderTypes: [] }), "ORDER_TYPES").state, "todo");
      const c = get(ready({ orderTypes: [{ type: "TAKE_AWAY", configured: false }] }), "ORDER_TYPES");
      assert.equal(c.state, "todo");
      assert.match(c.detail, /The kiosk cannot take orders: Take away has no sales area chosen/);
      assert.match(c.detail, /Settings > Order types/);
      assert.equal(c.tab, undefined);   // only the restaurant can fix it
    });
    it("one ready and one not: allowed, with a warning naming the one customers will not see", () => {
      const c = get(ready({ orderTypes: [{ type: "EAT_IN", configured: true }, { type: "DELIVERY", configured: false }] }), "ORDER_TYPES");
      assert.equal(c.state, "warning");
      assert.match(c.detail, /Eat in ready\. Customers will not see the rest: Delivery has no sales area chosen/);
    });
    it("says why: a sales area that is no longer in unTill, or no table numbers", () => {
      const gone = get(ready({ orderTypes: [{ type: "EAT_IN", configured: false, reason: "AREA_GONE" }] }), "ORDER_TYPES");
      assert.match(gone.detail, /Eat in points to a sales area that is no longer in unTill/);
      const tables = get(ready({ orderTypes: [{ type: "EAT_IN", configured: true }, { type: "TAKE_AWAY", configured: false, reason: "NO_TABLES" }] }), "ORDER_TYPES");
      assert.match(tables.detail, /Take away has no table numbers to use/);
    });
  });

  it("an owner who can sign in is required", () => {
    assert.equal(get(ready({ activeOwners: 0 }), "OWNER").state, "todo");
    assert.match(get(ready({ activeOwners: 2 }), "OWNER").detail, /2 active owners/);
  });

  describe("the printer", () => {
    const printer = (over: Partial<NonNullable<ReadinessFacts["printer"]>>) => ready({ printer: { ...ready().printer!, ...over } });
    it("each way it can be unfinished", () => {
      assert.equal(get(ready({ printer: null }), "PRINTER").state, "todo");
      assert.equal(get(printer({ enabled: false }), "PRINTER").state, "todo");
      assert.equal(get(printer({ hasAddress: false }), "PRINTER").state, "todo");
      assert.match(get(printer({ helperIssued: false }), "PRINTER").detail, /no secret/);
    });
    it("a helper that is simply not running right now is only a warning", () => assert.equal(get(printer({ helperOnline: false }), "PRINTER").state, "warning"));
  });

  describe("bornes and their printers", () => {
    const ok = { enabled: true, hasAddress: true, helperIssued: true, helperOnline: true };
    const bornes = (...b: [string, ReadinessFacts["printer"]][]) => ({ bornes: b.map(([name, printer]) => ({ name, printer })) });
    const printerCheck = (f: ReadinessFacts) => get(f, "PRINTER");

    it("every borne has a working printer: done, and it says how many", () => {
      const c = printerCheck(ready(bornes(["Entrée", ok], ["Terrasse", ok])));
      assert.equal(c.state, "done");
      assert.match(c.detail, /All 2 bornes/);
    });
    it("a borne whose helper is not running right now is a warning naming it, not a blocker", () => {
      const c = printerCheck(ready(bornes(["Entrée", ok], ["Terrasse", { ...ok, helperOnline: false }])));
      assert.equal(c.state, "warning");
      assert.match(c.detail, /helper for Terrasse is not running/);
    });
    it("a borne with no printer, or an unfinished one: the default printer takes over (warning), and with none it is a to-do", () => {
      const a = printerCheck(ready({ ...bornes(["Entrée", ok], ["Terrasse", null]), printer: ok }));
      assert.equal(a.state, "warning");
      assert.match(a.detail, /Terrasse has no working printer.*go to the default printer/);
      const b = printerCheck(ready({ ...bornes(["Entrée", { ...ok, helperIssued: false }]), printer: null }));
      assert.equal(b.state, "todo");
      assert.match(b.detail, /Entrée has no working printer, and there is no default printer/);
    });
    it("several without printers are named together, in the plural", () => {
      const c = printerCheck(ready({ ...bornes(["A", null], ["B", null]), printer: null }));
      assert.match(c.detail, /A, B have no working printer/);
    });
    it("no bornes at all behaves exactly as before: the default printer alone", () => {
      assert.equal(printerCheck(ready({ bornes: [] })).state, "done");
      assert.equal(printerCheck(ready({ bornes: [], printer: null })).state, "todo");
    });
    it("a printer is never required to go live, with or without bornes", () => {
      assert.equal(evaluateReadiness(ready({ ...bornes(["A", null]), printer: null }), NOW).ready, true);
    });
  });

  it("the proof: no confirmed order yet is a to-do, but never a blocker", () => {
    const f = ready({ placedOrders: 0 });
    assert.equal(get(f, "TEST_ORDER").state, "todo");
    assert.equal(evaluateReadiness(f, NOW).ready, true);
  });
});

describe("is an order type really set up (shared with the kiosk)", () => {
  const area = (n: number) => ({ tableRanges: n ? [{ FromTable: 1, ToTable: n }] : [] });
  it("customer picks a table: the sales area needs table ranges", () => {
    assert.equal(isOrderTypeConfigured({ askTable: true, mapping: {}, area: area(12) }), true);
    assert.equal(isOrderTypeConfigured({ askTable: true, mapping: {}, area: area(0) }), false);
  });
  it("no table asked: a fixed table or an allocation range is needed", () => {
    assert.equal(isOrderTypeConfigured({ askTable: false, mapping: { fixedTableNumber: 3001 }, area: area(0) }), true);
    assert.equal(isOrderTypeConfigured({ askTable: false, mapping: { tableRangeFrom: 3000 }, area: area(0) }), true);
    assert.equal(isOrderTypeConfigured({ askTable: false, mapping: {}, area: area(0) }), false);
  });
  it("never without a mapping or a sales area", () => {
    assert.equal(isOrderTypeConfigured({ askTable: false, mapping: null, area: area(5) }), false);
    assert.equal(isOrderTypeConfigured({ askTable: false, mapping: { fixedTableNumber: 1 }, area: undefined }), false);
  });
});

describe("ReadinessService reads only this restaurant's data", () => {
  function setup(over: { printerSeen?: Date | null; mappings?: Record<string, unknown>[]; bornes?: { id: string; name: string }[]; printers?: Record<string, unknown>[]; shown?: { articleId: bigint }[] } = {}) {
    const calls: Call[] = [];
    const prisma = {
      restaurant: { findUnique: async (a: any) => (a.where.id === "r1" ? {
        status: "ACTIVE", logoPath: "logo.png", timezone: "UTC",
        subscriptionPeriods: [{ id: "s", startsOn: new Date("2020-01-01T00:00:00Z"), endsOn: new Date("2099-12-31T00:00:00Z"), cancelledAt: null }],
        settings: { eatInEnabled: true, takeAwayEnabled: false, deliveryEnabled: false, askTableForEatIn: true },
        tpapi: { isEnabled: true, credentialsCiphertext: "x", lastSuccessAt: ago(H), lastFailureAt: null, lastErrorMessage: null, lastSyncAt: ago(H) },
      } : null) },
      tpapiDepartment: { count: async (a: any) => { calls.push({ model: "tpapiDepartment", op: "count", args: a }); return 4; } },
      tpapiArticle: {
        count: async (a: any) => { calls.push({ model: "tpapiArticle", op: "count", args: a }); return 90; },
        findMany: async (a: any) => { calls.push({ model: "tpapiArticle", op: "findMany", args: a }); return [{ untillId: 1n }, { untillId: 2n }]; },
      },
      productPresentation: { findMany: async (a: any) => { calls.push({ model: "productPresentation", op: "findMany", args: a }); return over.shown ?? [{ articleId: 1n }, { articleId: 99n }]; } },
      tpapiArticlePrice: { count: async (a: any) => { calls.push({ model: "tpapiArticlePrice", op: "count", args: a }); return 88; } },
      tpapiSalesArea: model([{ untillId: 100n, tableRanges: [{ FromTable: 1, ToTable: 12 }] }], calls, "tpapiSalesArea"),
      orderTypeMapping: model(over.mappings ?? [{ orderType: "EAT_IN", salesAreaId: 100n }], calls, "orderTypeMapping"),
      restaurantUser: { count: async (a: any) => { calls.push({ model: "restaurantUser", op: "count", args: a }); return 1; } },
      printer: { findMany: async (a: any) => { calls.push({ model: "printer", op: "findMany", args: a }); return over.printers ?? [{ kioskId: null, isEnabled: true, address: "192.168.0.109", helperTokenHash: "h", lastSeenAt: over.printerSeen ?? null }]; } },
      kiosk: { findMany: async (a: any) => { calls.push({ model: "kiosk", op: "findMany", args: a }); return over.bornes ?? []; } },
      order: { count: async (a: any) => { calls.push({ model: "order", op: "count", args: a }); return 2; } },
    };
    return { svc: new ReadinessService(prisma as never), calls };
  }

  it("a fully set-up restaurant comes out ready, and every query carries the restaurant", async () => {
    const { svc, calls } = setup({ printerSeen: ago(10_000) });
    const r = await svc.get("r1", NOW);
    assert.equal(r.ready, true);
    assert.equal(r.checks.find((c) => c.key === "PRINTER")!.state, "done");
    assert.ok(calls.length >= 8);
    for (const c of calls) assert.equal((c.args as any).where.restaurantId, "r1", `${c.model}.${c.op}`);
  });

  it("the print helper counts as running only if it was seen in the last 40 seconds", async () => {
    assert.equal((await setup({ printerSeen: ago(30_000) }).svc.get("r1", NOW)).checks.find((c) => c.key === "PRINTER")!.state, "done");
    assert.equal((await setup({ printerSeen: ago(60_000) }).svc.get("r1", NOW)).checks.find((c) => c.key === "PRINTER")!.state, "warning");
  });

  it("with bornes, each enabled borne's own printer is looked at, and the default printer is the one with no borne", async () => {
    const seen = new Date(NOW - 5_000);
    const { svc, calls } = setup({
      bornes: [{ id: "k1", name: "Entrée" }, { id: "k2", name: "Terrasse" }],
      printers: [{ kioskId: null, isEnabled: true, address: "a", helperTokenHash: "h", lastSeenAt: seen }, { kioskId: "k1", isEnabled: true, address: "b", helperTokenHash: "h", lastSeenAt: seen }],
    });
    const r = await svc.get("r1", NOW);
    const c = r.checks.find((x) => x.key === "PRINTER")!;
    assert.equal(c.state, "warning");
    assert.match(c.detail, /Terrasse has no working printer.*default printer/);
    assert.equal((calls.find((x) => x.model === "kiosk")!.args as any).where.restaurantId, "r1");
    assert.equal((calls.find((x) => x.model === "kiosk")!.args as any).where.isEnabled, true);   // switched-off bornes are not expected to print
  });

  it("only orders the till confirmed count as proof", async () => {
    const { svc, calls } = setup();
    await svc.get("r1", NOW);
    const q = calls.find((c) => c.model === "order")!.args as any;
    assert.deepEqual(q.where.status.in, ["CONFIRMED", "PAID"]);
  });

  it("a menu with nothing shown yet (products from unTill start hidden) blocks, and says where to show them", async () => {
    const { svc, calls } = setup({ shown: [{ articleId: 99n }] });   // only a product no longer on the menu
    const c = (await svc.get("r1", NOW)).checks.find((x) => x.key === "MENU")!;
    assert.equal(c.state, "todo");
    assert.match(c.detail, /none is shown on the kiosk yet.*Products \(Show all/);
    assert.equal((calls.find((x) => x.model === "productPresentation")!.args as any).where.isVisible, true);
  });

  it("an order type whose sales area is no longer in unTill (the till was changed) is not ready, and says so", async () => {
    const { svc } = setup({ mappings: [{ orderType: "EAT_IN", salesAreaId: 1941n }] });
    const c = (await svc.get("r1", NOW)).checks.find((x) => x.key === "ORDER_TYPES")!;
    assert.equal(c.state, "todo");
    assert.match(c.detail, /Eat in points to a sales area that is no longer in unTill/);
  });

  it("an order type with no mapping is not ready; an unknown restaurant is not found", async () => {
    const r = await setup({ mappings: [] }).svc.get("r1", NOW);
    assert.equal(r.checks.find((c) => c.key === "ORDER_TYPES")!.state, "todo");
    await assert.rejects(setup().svc.get("nope", NOW), NotFoundException);
  });
});
