import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException, ConflictException, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { KiosksService, MAX_BORNES, borneUrl, nextBorneCode } from "../src/restaurant/kiosks.service.js";
import { OrdersService } from "../src/kiosk/orders.service.js";
import { CatalogService } from "../src/kiosk/catalog.service.js";
import { resolveBorne, RESTAURANT_UNAVAILABLE } from "../src/kiosk/availability.js";
import { PrintingService } from "../src/printing/printing.service.js";
import { decode } from "./helpers/escpos-decode.js";
import { model, type Call } from "./helpers/fake-prisma.js";

describe("borne codes and addresses", () => {
  it("the next free code is K1, K2...; a gap is reused; case does not matter", () => {
    assert.equal(nextBorneCode([]), "K1");
    assert.equal(nextBorneCode(["K1", "K2"]), "K3");
    assert.equal(nextBorneCode(["K1", "K3"]), "K2");
    assert.equal(nextBorneCode(["k1"]), "K2");
  });
  it("never more than 4 characters", () => {
    for (let i = 1; i <= 99; i++) assert.ok(`K${i}`.length <= 4);
    assert.throws(() => nextBorneCode(Array.from({ length: 99 }, (_, i) => `K${i + 1}`)), ConflictException);
  });
  it("a borne's address is the kiosk with its code", () => {
    assert.equal(borneUrl("resto-a", "K2", {}), "http://localhost:3002/r/resto-a?borne=K2");
    assert.equal(borneUrl("resto-a", "K2", { KIOSK_APP_URL: "https://kiosk.chez.co/" }), "https://kiosk.chez.co/r/resto-a?borne=K2");
  });
});

describe("managing bornes", () => {
  function setup(kiosks: any[] = [], opts: { orders?: any[]; printers?: any[]; failCreateOnce?: boolean } = {}) {
    const calls: Call[] = [];
    const writes: { op: string; args: any }[] = [];
    let failed = false;
    const prisma: any = {
      kiosk: {
        ...model(kiosks, calls, "kiosk"),
        create: async (a: any) => {
          if (opts.failCreateOnce && !failed) { failed = true; throw Object.assign(new Error("dup"), { code: "P2002" }); }
          writes.push({ op: "create", args: a }); const k = { id: `id-${kiosks.length + 1}`, isEnabled: true, ...a.data }; kiosks.push(k); return k;
        },
        updateMany: async (a: any) => { writes.push({ op: "update", args: a }); return { count: 1 }; },
        deleteMany: (a: any) => ({ op: "deleteKiosk", args: a }),
      },
      printer: { ...model(opts.printers ?? [], calls, "printer"), deleteMany: (a: any) => ({ op: "deletePrinter", args: a }) },
      order: {
        count: async (a: any) => { calls.push({ model: "order", op: "count", args: a }); return (opts.orders ?? []).filter((o) => o.kioskId === a.where.kioskId && o.restaurantId === a.where.restaurantId).length; },
        groupBy: async (a: any) => { calls.push({ model: "order", op: "groupBy", args: a }); const m = new Map<string, number>(); for (const o of opts.orders ?? []) m.set(o.kioskId, (m.get(o.kioskId) ?? 0) + 1); return [...m].map(([kioskId, n]) => ({ kioskId, _count: { _all: n } })); },
      },
      $transaction: async (ops: any[]) => { writes.push(...ops); return []; },
    };
    return { svc: new KiosksService(prisma), calls, writes, kiosks };
  }
  const k = (id: string, code: string, over: any = {}) => ({ id, restaurantId: "r1", code, name: `Borne ${code}`, isEnabled: true, createdAt: new Date(Number(code.slice(1))), ...over });

  it("lists this restaurant's bornes with their address, their order count and their printer (or none)", async () => {
    const { svc, calls } = setup([k("a", "K1"), k("b", "K2"), k("x", "K1", { restaurantId: "r2" })],
      { orders: [{ kioskId: "a", restaurantId: "r1" }, { kioskId: "a", restaurantId: "r1" }], printers: [{ id: "p", restaurantId: "r1", kioskId: "a", name: "Entrée", address: "10.0.0.5", port: 9100, isEnabled: true, config: {}, lastSeenAt: null }] });
    const list = await svc.list("r1", "chez");
    assert.deepEqual(list.map((x) => [x.code, x.orders, x.printer.configured, x.url]), [["K1", 2, true, "http://localhost:3002/r/chez?borne=K1"], ["K2", 0, false, "http://localhost:3002/r/chez?borne=K2"]]);
    for (const c of calls) assert.equal((c.args as any).where.restaurantId, "r1", `${c.model}.${c.op}`);
  });

  it("adds a borne with the next free code and a trimmed name", async () => {
    const { svc, writes } = setup([k("a", "K1")]);
    const out = await svc.create("r1", "chez", "  Borne terrasse ");
    assert.deepEqual([out.code, out.name, out.orders], ["K2", "Borne terrasse", 0]);
    assert.deepEqual([writes[0]!.args.data.restaurantId, writes[0]!.args.data.code], ["r1", "K2"]);
  });
  it("two people adding at once: the loser quietly gets the next code", async () => {
    const { svc } = setup([], { failCreateOnce: true });
    assert.equal((await svc.create("r1", "chez", "A")).code, "K1");
  });
  it("needs a name, and stops at the limit", async () => {
    await assert.rejects(setup().svc.create("r1", "chez", "   "), BadRequestException);
    const full = Array.from({ length: MAX_BORNES }, (_, i) => k(`i${i}`, `K${i + 1}`));
    await assert.rejects(setup(full).svc.create("r1", "chez", "One more"), /at most 20/);
  });

  it("renames and switches off, scoped to the restaurant; another restaurant's borne is not found", async () => {
    const { svc, writes } = setup([k("a", "K1"), k("o", "K1", { restaurantId: "r2" })]);
    await svc.update("r1", "a", { name: " Entrée ", isEnabled: false });
    assert.deepEqual(writes[0]!.args.where, { id: "a", restaurantId: "r1" });
    assert.deepEqual(writes[0]!.args.data, { name: "Entrée", isEnabled: false });
    await assert.rejects(svc.update("r1", "o", { isEnabled: false }), NotFoundException);
    await assert.rejects(svc.update("r1", "a", { name: "  " }), BadRequestException);
  });

  it("deleting removes the borne AND its printer together, scoped; the printer first, so it can never become the default", async () => {
    const { svc, writes } = setup([k("a", "K1")]);
    assert.deepEqual(await svc.remove("r1", "a"), { removed: true });
    assert.deepEqual(writes.map((w) => w.op), ["deletePrinter", "deleteKiosk"]);
    assert.deepEqual(writes[0]!.args.where, { restaurantId: "r1", kioskId: "a" });
    assert.deepEqual(writes[1]!.args.where, { id: "a", restaurantId: "r1" });
  });
  it("a borne that took orders can only be switched off, and another restaurant's cannot be reached", async () => {
    const { svc, writes } = setup([k("a", "K1"), k("o", "K1", { restaurantId: "r2" })], { orders: [{ kioskId: "a", restaurantId: "r1" }] });
    await assert.rejects(svc.remove("r1", "a"), /Switch it off instead/);
    await assert.rejects(svc.remove("r1", "o"), NotFoundException);
    assert.equal(writes.length, 0);
  });
});

describe("which borne is asking", () => {
  const prisma = (rows: any[]) => ({ kiosk: { findFirst: async (a: any) => rows.find((r) => r.restaurantId === a.where.restaurantId && r.code === a.where.code) ?? null } }) as never;
  const rows = [{ id: "k2", restaurantId: "r1", code: "K2", name: "Terrasse", isEnabled: true }, { id: "k3", restaurantId: "r1", code: "K3", name: "Off", isEnabled: false }, { id: "x", restaurantId: "r2", code: "K9", name: "Other", isEnabled: true }];
  it("a known borne, whatever the capitalisation", async () => {
    assert.deepEqual(await resolveBorne(prisma(rows), "r1", "Chez", "k2"), { id: "k2", code: "K2", name: "Terrasse" });
  });
  it("no code, an unknown code, or another restaurant's code: no borne (the order still works)", async () => {
    for (const code of [undefined, null, "", "ZZ9", "K9"]) assert.equal(await resolveBorne(prisma(rows), "r1", "Chez", code as never), null, String(code));
  });
  it("a switched-off borne gets the calm 'unavailable' answer, naming the restaurant", async () => {
    await assert.rejects(resolveBorne(prisma(rows), "r1", "Chez", "K3"), (e) => e instanceof ServiceUnavailableException && (e.getResponse() as any).code === RESTAURANT_UNAVAILABLE && (e.getResponse() as any).restaurantName === "Chez");
  });
});

describe("the kiosk's start-up tells which borne it is", () => {
  function make(rows: any[]) {
    const rest = { id: "r1", slug: "chez", name: "Chez", currency: "MAD", status: "ACTIVE", locale: "fr", logoPath: null, welcomeImagePaths: [], tagline: null, primaryColor: null, settings: {}, tpapi: null };
    const prisma: any = {
      restaurant: { findUnique: async () => rest },
      tpapiSalesArea: { findMany: async () => [] },
      orderTypeMapping: { findMany: async () => [] },
      kiosk: { findFirst: async (a: any) => rows.find((r) => r.code === a.where.code && r.restaurantId === a.where.restaurantId) ?? null },
    };
    return new CatalogService(prisma, { publicUrl: () => null } as never);
  }
  const rows = [{ id: "k2", restaurantId: "r1", code: "K2", name: "Terrasse", isEnabled: true }, { id: "k3", restaurantId: "r1", code: "K3", name: "Off", isEnabled: false }];
  it("names the borne; an unknown or missing code is none; a switched-off one is unavailable; junk is ignored", async () => {
    const svc = make(rows);
    assert.deepEqual((await svc.bootstrap("chez", "K2")).borne, { code: "K2", name: "Terrasse" });
    assert.equal((await svc.bootstrap("chez", "NOPE")).borne, null);
    assert.equal((await svc.bootstrap("chez")).borne, null);
    assert.equal((await svc.bootstrap("chez", "bad code!")).borne, null);
    await assert.rejects(svc.bootstrap("chez", "k3"), ServiceUnavailableException);
  });
});

describe("placing an order from a borne", () => {
  function make(rows: any[], existing: any = null) {
    const created: any[] = [];
    const printed: any[] = [];
    const tx: any = {
      $executeRaw: async () => 1,
      orderCounter: { upsert: async () => ({ lastSequence: 14 }) },
      order: { create: async (a: any) => { created.push(a.data); return { id: "o1", status: "PENDING", createdAt: new Date(), ...a.data, items: [] }; } },
      orderStatusHistory: { create: async () => ({}) },
    };
    const prisma: any = {
      ...tx,
      restaurant: { findUnique: async () => ({ id: "r1", name: "Chez", currency: "MAD", status: "ACTIVE", locale: "fr", settings: { takeAwayEnabled: true } }) },
      order: { findFirst: async () => existing, findMany: async () => [], create: tx.order.create },
      kiosk: { findFirst: async (a: any) => rows.find((r) => r.code === a.where.code && r.restaurantId === a.where.restaurantId) ?? null },
      orderTypeMapping: { findFirst: async () => ({ fixedTableNumber: 3001, tablePart: "a" }) },
      $transaction: async (fn: any) => fn(tx),
    };
    const pricing: any = { price: async () => ({ total: 10, subtotal: 9, taxTotal: 1, itemCount: 1, salesAreaId: "1", priceLevelId: "2", currency: "MAD", lines: [] }) };
    const printing: any = { enqueueForOrder: async (_r: string, _o: string, _a: boolean, loaded: any) => { printed.push(loaded); } };
    return { svc: new OrdersService(prisma, pricing, printing), created, printed };
  }
  const dto = (extra: any = {}) => ({ clientOrderId: "11111111-1111-4111-8111-111111111111", orderType: "TAKE_AWAY", salesAreaId: "1", lines: [], ...extra }) as never;
  const rows = [{ id: "k2", restaurantId: "r1", code: "K2", name: "Terrasse", isEnabled: true }, { id: "k3", restaurantId: "r1", code: "K3", name: "Off", isEnabled: false }];

  it("the reference starts with the borne's code and the order remembers the borne, and so does the ticket request", async () => {
    const { svc, created, printed } = make(rows);
    const out = await svc.create("chez", dto({ borneCode: "k2" }));
    assert.match(out.reference, /^K2-\d{4}-014$/);
    assert.equal(created[0].kioskId, "k2");
    assert.equal(printed[0].kioskId, "k2");
  });
  it("no borne, or an unknown code, behaves exactly as before: K0 and no borne", async () => {
    for (const extra of [{}, { borneCode: "ZZ" }]) {
      const { svc, created } = make(rows);
      const out = await svc.create("chez", dto(extra));
      assert.match(out.reference, /^K0-\d{4}-014$/);
      assert.equal(created[0].kioskId, null);
    }
  });
  it("a switched-off borne takes no new order", async () => {
    const { svc, created } = make(rows);
    await assert.rejects(svc.create("chez", dto({ borneCode: "K3" })), ServiceUnavailableException);
    assert.equal(created.length, 0);
  });
  it("but a retry of an order that already exists still returns it, even if the borne has since been switched off", async () => {
    const existing = { id: "o0", reference: "K3-1002-001", status: "PENDING", orderType: "TAKE_AWAY", tableNumber: 3001, total: 10, currency: "MAD", itemCount: 1, createdAt: new Date(), items: [] };
    const { svc, created } = make(rows, existing);
    assert.equal((await svc.create("chez", dto({ borneCode: "K3" }))).reference, "K3-1002-001");
    assert.equal(created.length, 0);
  });
});

describe("tickets go to the right printer", () => {
  const P = (id: string, kioskId: string | null, over: any = {}) => ({ id, restaurantId: "r1", kioskId, kind: "RECEIPT", connection: "NETWORK", name: id, address: "1.1.1.1", port: 9100, isEnabled: true, config: {}, lastSeenAt: null, helperTokenHash: null, helperTokenIssuedAt: null, lastErrorMessage: null, lastErrorAt: null, createdAt: new Date(0), ...over });
  const order = (kioskId: string | null) => ({ id: "o1", restaurantId: "r1", kioskId, reference: kioskId ? "K2-1002-014" : "K0-1002-014", orderType: "TAKE_AWAY", tableNumber: 3001, total: 10, currency: "MAD", createdAt: new Date("2026-10-02T12:00:00Z"), items: [{ lineNumber: 1, parentLineNumber: null, kind: "PRODUCT", articleId: 1n, articleName: "Soup", quantity: 1, unitPrice: 10, lineTotal: 10 }] });
  function setup(printers: any[], kiosks: any[] = [{ id: "k2", restaurantId: "r1", name: "Borne terrasse" }]) {
    const calls: Call[] = []; const jobs: any[] = [];
    const prisma: any = {
      printer: model(printers, calls, "printer"),
      kiosk: model(kiosks, calls, "kiosk"),
      restaurant: model([{ id: "r1", name: "Chez", timezone: "Africa/Casablanca", settings: { ticketFooterText: null, askTableForEatIn: false } }], calls, "restaurant"),
      order: model([order("k2")], calls, "order"),
      productPresentation: model([], calls, "productPresentation"),
      printJob: { create: async (a: any) => { jobs.push(a.data); return { id: "j1", status: "QUEUED" }; } },
    };
    return { svc: new PrintingService(prisma), jobs, calls };
  }
  const text = (job: any) => decode(job.payload).toString?.() ?? JSON.stringify(decode(job.payload));

  it("an order from a borne prints on THAT borne's printer, with the borne's name on the ticket", async () => {
    const { svc, jobs } = setup([P("default", null), P("p2", "k2"), P("p3", "k3")]);
    await svc.enqueueForOrder("r1", "o1", true, order("k2") as never);
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].printerId, "p2");
    assert.match(JSON.stringify(decode(jobs[0].payload)), /Borne : Borne terrasse/);
  });
  it("an order from no borne prints on the restaurant's default printer, never on a borne's", async () => {
    const { svc, jobs } = setup([P("p2", "k2"), P("default", null)]);
    await svc.enqueueForOrder("r1", "o1", true, order(null) as never);
    assert.equal(jobs[0].printerId, "default");
    assert.equal(/Borne :/.test(JSON.stringify(decode(jobs[0].payload))), false);
  });
  it("a borne with no printer, or one switched off, falls back to the default so the ticket is not lost", async () => {
    for (const printers of [[P("default", null)], [P("default", null), P("p2", "k2", { isEnabled: false })]]) {
      const { svc, jobs } = setup(printers);
      await svc.enqueueForOrder("r1", "o1", true, order("k2") as never);
      assert.equal(jobs[0].printerId, "default");
    }
  });
  it("no working printer anywhere: nothing is queued, and an automatic ticket is not an error (the order matters more)", async () => {
    const { svc, jobs } = setup([P("p2", "k2", { isEnabled: false })]);
    assert.equal(await svc.enqueueForOrder("r1", "o1", true, order("k2") as never), null);
    assert.equal(jobs.length, 0);
    await assert.rejects(svc.enqueueForOrder("r1", "o1", false, order("k2") as never), BadRequestException);
  });
  it("one borne's printer settings and helper token never touch another's", async () => {
    const { svc, calls } = setup([P("default", null), P("p2", "k2")]);
    await svc.get("r1", "k2"); await svc.get("r1");
    const finds = calls.filter((c) => c.model === "printer" && c.op === "findFirst").map((c) => (c.args as any).where.kioskId);
    assert.deepEqual(finds, ["k2", null]);
  });
});
