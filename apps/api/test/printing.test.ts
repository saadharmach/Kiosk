import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { PrintingService } from "../src/printing/printing.service.js";
import { decode } from "./helpers/escpos-decode.js";
import { model, type Call } from "./helpers/fake-prisma.js";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

interface World {
  printers?: Record<string, unknown>[];
  restaurants?: Record<string, unknown>[];
  orders?: Record<string, unknown>[];
  presentations?: Record<string, unknown>[];
  jobs?: Record<string, unknown>[];
}

const printer = (over: Record<string, unknown> = {}) => ({
  id: "p1", restaurantId: "r1", kind: "RECEIPT", connection: "NETWORK", name: "Caisse",
  address: "192.168.1.50", port: 9100, isEnabled: true, config: {}, lastSeenAt: null,
  helperTokenHash: null, helperTokenIssuedAt: null, lastErrorMessage: null, lastErrorAt: null,
  createdAt: new Date(0), ...over,
});

const restaurant = (over: Record<string, unknown> = {}) => ({
  id: "r1", name: "Resto A", timezone: "Europe/Paris",
  settings: { ticketFooterText: "Merci !", askTableForEatIn: false }, ...over,
});

const item = (lineNumber: number, over: Record<string, unknown> = {}) => ({
  restaurantId: "r1", orderId: "o1", lineNumber, parentLineNumber: null, kind: "PRODUCT", articleId: null,
  articleName: "Item", quantity: 1, unitPrice: 0, lineTotal: 0, ...over,
});

const order = (over: Record<string, unknown> = {}) => ({
  id: "o1", restaurantId: "r1", reference: "K0-0930-005", orderType: "EAT_IN", tableNumber: 705, total: 19.5,
  currency: "MAD", createdAt: new Date("2026-09-30T12:32:00Z"),
  items: [
    item(1, { articleId: 1n, articleName: "Soup", quantity: 2, unitPrice: 4.5, lineTotal: 9 }),
    item(2, { articleId: 8n, articleName: "Fillet Steak", unitPrice: 9, lineTotal: 9 }),
    item(3, { parentLineNumber: 2, kind: "OPTION", articleName: "Medium", unitPrice: 0, lineTotal: 0 }),
    item(4, { parentLineNumber: 2, kind: "OPTION", articleName: "Pepper sauce", unitPrice: 1.5, lineTotal: 1.5 }),
  ],
  ...over,
});

function setup(w: World = {}) {
  const calls: Call[] = [];
  const printers: Record<string, unknown>[] = w.printers ?? [printer()];
  const created: Record<string, unknown>[] = [];
  const jobs = w.jobs ?? [];
  const prisma = {
    printer: {
      ...model(printers, calls, "printer"),
      updateMany: async (a: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        calls.push({ model: "printer", op: "updateMany", args: a });
        for (const p of printers) if (p.id === a.where.id && p.restaurantId === a.where.restaurantId) Object.assign(p, a.data);
        return { count: 1 };
      },
      create: async (a: { data: Record<string, unknown> }) => {
        calls.push({ model: "printer", op: "create", args: a });
        printers.push({ id: "new", createdAt: new Date(), ...a.data });
        return a.data;
      },
    },
    printJob: {
      ...model(jobs, calls, "printJob"),
      create: async (a: { data: Record<string, unknown> }) => { created.push(a.data); return { id: "j1", status: "QUEUED" }; },
      updateMany: async (a: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        calls.push({ model: "printJob", op: "updateMany", args: a });
        for (const j of jobs) if (j.id === a.where.id && j.printerId === a.where.printerId) Object.assign(j, a.data);
        return { count: 1 };
      },
    },
    restaurant: model(w.restaurants ?? [restaurant()], calls, "restaurant"),
    order: model(w.orders ?? [order()], calls, "order"),
    productPresentation: model(w.presentations ?? [], calls, "productPresentation"),
  };
  return { svc: new PrintingService(prisma as never), calls, created, printers, jobs };
}

describe("PrintingService: settings", () => {
  it("reports a restaurant with no printer as not configured, with default settings", async () => {
    const { svc } = setup({ printers: [] });
    const r = await svc.get("r1");
    assert.equal(r.configured, false);
    assert.equal(r.config.autoPrint, true);
  });

  it("only shows another restaurant's printer to that restaurant", async () => {
    const { svc } = setup({ printers: [printer({ restaurantId: "r2" })] });
    assert.equal((await svc.get("r1")).configured, false);
  });

  it("reports the helper online only when it was heard from in the last 20 seconds", async () => {
    const fresh = setup({ printers: [printer({ lastSeenAt: new Date(Date.now() - 5_000) })] });
    const stale = setup({ printers: [printer({ lastSeenAt: new Date(Date.now() - 60_000) })] });
    const never = setup({ printers: [printer()] });
    const online = async (s: ReturnType<typeof setup>) => { const r = await s.svc.get("r1"); return r.configured && r.helper.online; };
    assert.equal(await online(fresh), true);
    assert.equal(await online(stale), false);
    assert.equal(await online(never), false);
  });

  it("creates the printer on first save, trimming the text", async () => {
    const { svc, calls } = setup({ printers: [] });
    await svc.save("r1", { name: "  Caisse ", address: " 192.168.1.50 ", port: 9100, isEnabled: true, copies: 2 });
    const create = calls.find((c) => c.op === "create")!.args as { data: Record<string, unknown> };
    assert.equal(create.data.restaurantId, "r1");
    assert.equal(create.data.name, "Caisse");
    assert.equal(create.data.address, "192.168.1.50");
    assert.equal(create.data.kind, "RECEIPT");
    assert.equal(create.data.connection, "NETWORK");
    assert.equal((create.data.config as { copies: number }).copies, 2);
  });

  it("updates the existing printer, scoped by restaurant, and keeps settings it was not sent", async () => {
    const { svc, calls, printers } = setup({ printers: [printer({ config: { copies: 3, cut: false } })] });
    await svc.save("r1", { name: "Caisse", address: "10.0.0.9", port: 9100, isEnabled: true, autoPrint: false });
    const update = calls.find((c) => c.model === "printer" && c.op === "updateMany")!.args as { where: Record<string, unknown> };
    assert.equal(update.where.restaurantId, "r1");
    assert.equal(update.where.id, "p1");
    assert.deepEqual(printers[0]!.config, { autoPrint: false, copies: 3, cut: false, codepage: "CP858" });
    assert.equal(printers[0]!.address, "10.0.0.9");
  });
});

describe("PrintingService: the helper's token", () => {
  it("refuses to issue a token before the printer exists", async () => {
    const { svc } = setup({ printers: [] });
    await assert.rejects(svc.issueToken("r1"), (e: { getStatus?: () => number }) => e.getStatus?.() === 400);
  });

  it("returns a token once and stores only its hash", async () => {
    const { svc, printers } = setup();
    const { token } = await svc.issueToken("r1");
    assert.match(token, /^pht_[A-Za-z0-9_-]{43}$/);
    assert.equal(printers[0]!.helperTokenHash, sha256(token));
    assert.ok(printers[0]!.helperTokenIssuedAt instanceof Date);
    assert.ok(!JSON.stringify(printers).includes(token), "the plaintext is nowhere in storage");
  });

  it("issues a different token every time", async () => {
    const { svc } = setup();
    const a = (await svc.issueToken("r1")).token;
    const b = (await svc.issueToken("r1")).token;
    assert.notEqual(a, b);
  });

  it("looks a helper up by the hash of its token", async () => {
    const { svc, calls } = setup({ printers: [printer({ helperTokenHash: sha256("pht_abc") })] });
    const found = await svc.authenticate("pht_abc");
    assert.equal(found?.id, "p1");
    assert.equal(await svc.authenticate("pht_other"), null);
    const used = calls.filter((c) => c.op === "findUnique").map((c) => (c.args as { where: Record<string, unknown> }).where.helperTokenHash);
    assert.deepEqual(used, [sha256("pht_abc"), sha256("pht_other")]);
  });
});

describe("PrintingService: queuing tickets", () => {
  it("queues a test ticket the printer can print", async () => {
    const { svc, created } = setup();
    await svc.enqueueTest("r1");
    assert.equal(created.length, 1);
    assert.equal(created[0]!.kind, "TEST");
    assert.equal(created[0]!.restaurantId, "r1");
    assert.equal(created[0]!.printerId, "p1");
    assert.equal(created[0]!.orderId, null);
    const d = decode(created[0]!.payload as Buffer);
    assert.ok(d.cut);
    assert.match(d.plain.join("\n"), /Ticket de test/);
    assert.match(d.plain.join("\n"), /Merci !/);
  });

  it("repeats the ticket for the number of copies", async () => {
    const one = setup({ printers: [printer({ config: { copies: 1 } })] });
    const two = setup({ printers: [printer({ config: { copies: 2 } })] });
    await one.svc.enqueueTest("r1");
    await two.svc.enqueueTest("r1");
    const len = (s: ReturnType<typeof setup>) => (s.created[0]!.payload as Buffer).length;
    assert.equal(len(two), len(one) * 2);
    assert.equal(two.created[0]!.copies, 2);
  });

  it("honours the code page and the cut setting of the printer", async () => {
    const { svc, created } = setup({ printers: [printer({ config: { codepage: "CP1252", cut: false } })] });
    await svc.enqueueTest("r1");
    const d = decode(created[0]!.payload as Buffer, "CP1252");
    assert.equal(d.codepageByte, 16);
    assert.equal(d.cut, false);
  });
});

describe("PrintingService: automatic printing when a kiosk order is placed", () => {
  it("does nothing, quietly, when there is no printer", async () => {
    const { svc, created } = setup({ printers: [] });
    assert.equal(await svc.enqueueForOrder("r1", "o1", true), null);
    assert.equal(created.length, 0);
  });

  it("does nothing when the printer is switched off", async () => {
    const { svc, created } = setup({ printers: [printer({ isEnabled: false })] });
    assert.equal(await svc.enqueueForOrder("r1", "o1", true), null);
    assert.equal(created.length, 0);
  });

  it("does nothing when automatic printing is off, but a reprint still works", async () => {
    const { svc, created } = setup({ printers: [printer({ config: { autoPrint: false } })] });
    assert.equal(await svc.enqueueForOrder("r1", "o1", true), null);
    assert.equal(created.length, 0);
    await svc.enqueueForOrder("r1", "o1", false);
    assert.equal(created.length, 1);
  });

  it("queues the ticket when everything is on", async () => {
    const { svc, created } = setup();
    await svc.enqueueForOrder("r1", "o1", true);
    assert.equal(created.length, 1);
    assert.equal(created[0]!.kind, "TICKET");
    assert.equal(created[0]!.orderId, "o1");
  });

  it("never throws for an automatic ticket, even when the order cannot be found", async () => {
    const { svc, created } = setup({ orders: [] });
    assert.equal(await svc.enqueueForOrder("r1", "missing", true), null);
    assert.equal(created.length, 0);
  });

  it("tells the manager why a reprint cannot happen", async () => {
    const none = setup({ printers: [] });
    await assert.rejects(none.svc.enqueueForOrder("r1", "o1", false), (e: { getStatus?: () => number }) => e.getStatus?.() === 400);
    const missing = setup({ orders: [] });
    await assert.rejects(missing.svc.enqueueForOrder("r1", "nope", false), (e: { getStatus?: () => number }) => e.getStatus?.() === 404);
  });

  it("will not print another restaurant's order", async () => {
    const { svc, created } = setup({ orders: [order({ restaurantId: "r2" })] });
    await assert.rejects(svc.enqueueForOrder("r1", "o1", false), (e: { getStatus?: () => number }) => e.getStatus?.() === 404);
    assert.equal(created.length, 0);
  });
});

describe("PrintingService: the ticket built from an order", () => {
  const ticket = async (w: World = {}) => {
    const { svc, created } = setup(w);
    await svc.enqueueForOrder("r1", "o1", false);
    return decode(created[0]!.payload as Buffer).plain;
  };

  it("lists each product with its options, and adds the options into the line total", async () => {
    const lines = await ticket();
    assert.ok(lines.some((l) => /^2 x Soup +9,00$/.test(l)));
    assert.ok(lines.some((l) => /^1 x Fillet Steak +10,50$/.test(l)), "9,00 + 1,50 of options");
    assert.ok(lines.some((l) => /^ {4}Medium$/.test(l.trimEnd())), "a free option shows no price");
    assert.ok(lines.some((l) => /^ {4}Pepper sauce +\+1,50$/.test(l)));
  });

  it("uses the French catalog name, whatever language the customer used", async () => {
    const lines = await ticket({ presentations: [{ restaurantId: "r1", articleId: 1n, displayName: { fr: "Soupe du jour", en: "Soup of the day", ar: "شوربة" } }] });
    assert.ok(lines.some((l) => l.startsWith("2 x Soupe du jour")));
    assert.ok(!lines.some((l) => l.includes("شوربة")));
  });

  it("falls back to the unTill name when there is no French name", async () => {
    const lines = await ticket({ presentations: [{ restaurantId: "r1", articleId: 1n, displayName: { en: "Soup of the day" } }] });
    assert.ok(lines.some((l) => l.startsWith("2 x Soup of the day")), "any language with text beats a blank");
  });

  it("shows the stand number big when the customer was not asked for a table", async () => {
    const lines = await ticket();
    assert.ok(lines.includes("705"));
    assert.ok(lines.some((l) => l.includes("POSEZ CE NUMÉRO SUR VOTRE TABLE")));
    assert.ok(lines.some((l) => l.includes("Sur place") && !l.includes("Table")));
  });

  it("shows the order number big, and the table in the header, when the customer typed their table", async () => {
    const lines = await ticket({ restaurants: [restaurant({ settings: { ticketFooterText: null, askTableForEatIn: true } })], orders: [order({ tableNumber: 12 })] });
    assert.ok(lines.includes("K0-0930-005"));
    assert.ok(lines.some((l) => l.includes("VOTRE NUMÉRO DE COMMANDE")));
    assert.ok(lines.some((l) => l.includes("Sur place - Table 12")));
  });

  it("treats a take-away order like the kiosk does: the stand number, even if eat-in asks for tables", async () => {
    const lines = await ticket({
      restaurants: [restaurant({ settings: { ticketFooterText: null, askTableForEatIn: true } })],
      orders: [order({ orderType: "TAKE_AWAY", tableNumber: 3001 })],
    });
    assert.ok(lines.includes("3001"));
    assert.ok(lines.some((l) => l.includes("À emporter")));
  });

  it("falls back to the reference when an order has no table number at all", async () => {
    const lines = await ticket({ orders: [order({ tableNumber: null })] });
    assert.ok(lines.includes("K0-0930-005"));
  });

  it("prints the time in the restaurant's own time zone", async () => {
    const lines = await ticket();
    assert.ok(lines.some((l) => l.includes("30/09/26 14:32")), "12:32 UTC is 14:32 in Paris in September");
  });

  it("prints the total and the footer from the order and the settings", async () => {
    const lines = await ticket();
    assert.ok(lines.some((l) => /^TOTAL +19,50 MAD$/.test(l)));
    assert.ok(lines.some((l) => l.includes("Merci !")));
  });
});

describe("PrintingService: the helper reports back", () => {
  const job = (over: Record<string, unknown> = {}) => ({ id: "j1", printerId: "p1", restaurantId: "r1", status: "PRINTING", attempts: 1, ...over });
  const p = printer() as never;

  it("marks a job printed", async () => {
    const { svc, jobs } = setup({ jobs: [job()] });
    assert.deepEqual(await svc.report(p, "j1", true), { status: "PRINTED" });
    assert.equal(jobs[0]!.status, "PRINTED");
    assert.ok(jobs[0]!.printedAt instanceof Date);
  });

  it("puts a failed job back in the queue with a growing wait", async () => {
    const { svc, jobs } = setup({ jobs: [job({ attempts: 2 })] });
    const before = Date.now();
    assert.deepEqual(await svc.report(p, "j1", false, "Connection refused"), { status: "QUEUED" });
    assert.equal(jobs[0]!.status, "QUEUED");
    assert.equal(jobs[0]!.lastError, "Connection refused");
    const wait = (jobs[0]!.nextAttemptAt as Date).getTime() - before;
    assert.ok(wait >= 19_000 && wait <= 21_500, `attempt 2 waits about 20s (was ${wait}ms)`);
  });

  it("gives up after 5 attempts and keeps the reason", async () => {
    const { svc, jobs } = setup({ jobs: [job({ attempts: 5 })] });
    assert.deepEqual(await svc.report(p, "j1", false, "Timed out"), { status: "FAILED" });
    assert.equal(jobs[0]!.status, "FAILED");
    assert.equal(jobs[0]!.nextAttemptAt, null);
  });

  it("ignores a late answer for a job that is already finished", async () => {
    const { svc, jobs, calls } = setup({ jobs: [job({ status: "PRINTED" })] });
    assert.deepEqual(await svc.report(p, "j1", false, "late"), { status: "PRINTED" });
    assert.equal(jobs[0]!.status, "PRINTED");
    assert.equal(calls.filter((c) => c.model === "printJob" && c.op === "updateMany").length, 0);
  });

  it("does not let a helper answer another printer's job", async () => {
    const { svc, jobs } = setup({ jobs: [job({ printerId: "other-printer" })] });
    await assert.rejects(svc.report(p, "j1", true), (e: { getStatus?: () => number }) => e.getStatus?.() === 404);
    assert.equal(jobs[0]!.status, "PRINTING");
  });

  it("does not let a helper answer another restaurant's job", async () => {
    const { svc } = setup({ jobs: [job({ restaurantId: "r2" })] });
    await assert.rejects(svc.report(p, "j1", true), (e: { getStatus?: () => number }) => e.getStatus?.() === 404);
  });

  it("scopes every update by the printer", async () => {
    const { svc, calls } = setup({ jobs: [job()] });
    await svc.report(p, "j1", true);
    for (const c of calls.filter((x) => x.model === "printJob" && x.op === "updateMany")) {
      assert.equal((c.args as { where: Record<string, unknown> }).where.printerId, "p1");
    }
    for (const c of calls.filter((x) => x.model === "printer" && x.op === "updateMany")) {
      assert.equal((c.args as { where: Record<string, unknown> }).where.restaurantId, "r1");
    }
  });
});
