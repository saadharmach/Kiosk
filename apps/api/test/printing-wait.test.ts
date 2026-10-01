import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PrintingService, type LoadedOrder } from "../src/printing/printing.service.js";
import { decode } from "./helpers/escpos-decode.js";
import { model } from "./helpers/fake-prisma.js";

const printer = (over: Record<string, unknown> = {}) => ({
  id: "p1", restaurantId: "r1", kind: "RECEIPT", connection: "NETWORK", name: "Caisse", address: "192.168.1.50", port: 9100,
  isEnabled: true, config: {}, lastSeenAt: new Date(), createdAt: new Date(0), ...over,
});

const item = (lineNumber: number, over: Record<string, unknown> = {}) => ({
  lineNumber, parentLineNumber: null, kind: "PRODUCT", articleId: null, articleName: "Item", quantity: 1, unitPrice: 0, lineTotal: 0, ...over,
});

const order = (over: Partial<LoadedOrder> = {}): LoadedOrder => ({
  id: "o1", restaurantId: "r1", reference: "K0-0930-005", orderType: "EAT_IN", tableNumber: 705, total: 13.5, currency: "MAD",
  createdAt: new Date("2026-09-30T12:32:00Z"),
  items: [item(1, { articleId: 1n, articleName: "Soup", unitPrice: 4.5, lineTotal: 4.5 }), item(2, { articleId: 2n, articleName: "Pie", unitPrice: 9, lineTotal: 9 })],
  ...over,
});

/** The service with a fake database that has a job queue the claim query reads from. */
function setup(opts: { printers?: Record<string, unknown>[]; delayMs?: number; recheckMs?: number } = {}) {
  const queue: { id: string; payload: Buffer; attempts: number }[] = [];
  const heartbeats: unknown[] = [];
  const reads: string[] = [];
  const delay = () => new Promise((r) => setTimeout(r, opts.delayMs ?? 0));
  const slow = <T extends object>(name: string, m: T): T =>
    new Proxy(m, { get: (t, k) => (typeof (t as never)[k] === "function" && String(k).startsWith("find")
      ? async (...a: unknown[]) => { reads.push(`${name}.${String(k)}`); await delay(); return (t as never as Record<string, (...x: unknown[]) => unknown>)[k as string]!(...a); }
      : (t as never)[k]) });

  const printers = opts.printers ?? [printer()];
  const prisma = {
    printer: {
      ...slow("printer", model(printers)),
      updateMany: async (a: unknown) => { heartbeats.push(a); return { count: 1 }; },
    },
    printJob: {
      create: async (a: { data: { payload: Buffer } }) => {
        await delay();
        queue.push({ id: `job-${queue.length + 1}`, payload: a.data.payload, attempts: 1 });
        return { id: `job-${queue.length}`, status: "QUEUED" };
      },
    },
    restaurant: slow("restaurant", model([{ id: "r1", name: "Resto A", timezone: "Europe/Paris", settings: { ticketFooterText: null, askTableForEatIn: false } }])),
    order: slow("order", model([{ ...order(), restaurantId: "r1" }])),
    productPresentation: slow("productPresentation", model([{ restaurantId: "r1", articleId: 1n, displayName: { fr: "Soupe du jour" } }])),
    $queryRaw: async () => { const j = queue.shift(); return j ? [j] : []; },
  };
  const svc = new PrintingService(prisma as never);
  if (opts.recheckMs) (svc as unknown as { recheckMs: number }).recheckMs = opts.recheckMs;
  return { svc, queue, heartbeats, reads };
}

const p1 = printer() as never;
const took = async <T>(fn: () => Promise<T>) => { const t = Date.now(); const r = await fn(); return { r, ms: Date.now() - t }; };

describe("PrintingService.next: handing out work", () => {
  it("gives a waiting ticket straight away", async () => {
    const { svc, queue } = setup();
    queue.push({ id: "j1", payload: Buffer.from("abc"), attempts: 1 });
    const { r, ms } = await took(() => svc.next(p1, 5000));
    assert.equal(r.job?.id, "j1");
    assert.equal(r.job?.host, "192.168.1.50");
    assert.equal(r.job?.dataBase64, Buffer.from("abc").toString("base64"));
    assert.ok(ms < 200, `was ${ms}ms`);
  });

  it("answers 'nothing' at once when it is not asked to wait", async () => {
    const { svc } = setup();
    const { r, ms } = await took(() => svc.next(p1));
    assert.equal(r.job, null);
    assert.ok(ms < 200);
  });

  it("does nothing for a printer that is switched off, and does not wait", async () => {
    const { svc, queue } = setup();
    queue.push({ id: "j1", payload: Buffer.from("x"), attempts: 1 });
    const { r, ms } = await took(() => svc.next(printer({ isEnabled: false }) as never, 5000));
    assert.equal(r.job, null);
    assert.ok(ms < 200);
    assert.equal(queue.length, 1, "the job was not taken");
  });
});

describe("PrintingService.next: waiting for a ticket", () => {
  it("holds the request for the time asked when nothing arrives", async () => {
    const { svc } = setup({ recheckMs: 40 });
    const { r, ms } = await took(() => svc.next(p1, 200));
    assert.equal(r.job, null);
    assert.ok(ms >= 190 && ms < 600, `held for about 200ms (was ${ms}ms)`);
  });

  it("wakes the instant a ticket is queued for that printer, long before the wait or the recheck ends", async () => {
    const { svc } = setup({ recheckMs: 5000 });
    const waiting = took(() => svc.next(p1, 10_000));
    await new Promise((r) => setTimeout(r, 60));
    await svc.enqueueTest("r1");
    const { r, ms } = await waiting;
    assert.ok(r.job, "the helper received the ticket");
    assert.ok(ms < 1000, `delivered in ${ms}ms, not after the 5s recheck`);
    assert.match(decode(Buffer.from(r.job!.dataBase64, "base64")).plain.join("\n"), /Ticket de test/);
  });

  it("does not wake for another printer's ticket", async () => {
    const { svc, queue } = setup({ printers: [printer(), printer({ id: "p2", restaurantId: "r2" })], recheckMs: 5000 });
    const waiting = took(() => svc.next(p1, 300));
    await new Promise((r) => setTimeout(r, 50));
    // a ticket for the other restaurant's printer: it must not be handed to this helper
    (svc as unknown as { wake: (id: string) => void }).wake("p2");
    const { r, ms } = await waiting;
    assert.equal(r.job, null);
    assert.ok(ms >= 250, `kept waiting (was ${ms}ms)`);
    assert.equal(queue.length, 0);
  });

  it("also looks again on its own, in case another API instance queued the ticket", async () => {
    const { svc, queue } = setup({ recheckMs: 40 });
    const waiting = took(() => svc.next(p1, 5000));
    await new Promise((r) => setTimeout(r, 100));
    queue.push({ id: "from-elsewhere", payload: Buffer.from("x"), attempts: 1 }); // no wake
    const { r, ms } = await waiting;
    assert.equal(r.job?.id, "from-elsewhere");
    assert.ok(ms < 1000, `was ${ms}ms`);
  });

  it("stops waiting as soon as the helper hangs up, and takes nothing", async () => {
    const { svc, queue } = setup({ recheckMs: 5000 });
    const hangup = new AbortController();
    const waiting = took(() => svc.next(p1, 10_000, hangup.signal));
    await new Promise((r) => setTimeout(r, 50));
    hangup.abort();
    queue.push({ id: "late", payload: Buffer.from("x"), attempts: 1 });
    const { r, ms } = await waiting;
    assert.equal(r.job, null);
    assert.ok(ms < 500, `was ${ms}ms`);
    assert.equal(queue.length, 1, "the ticket stays queued for the next request");
  });

  it("does not hammer the database with 'I am alive' writes while it waits", async () => {
    const { svc, heartbeats } = setup({ recheckMs: 20 });
    await svc.next(printer({ lastSeenAt: new Date(0) }) as never, 300);
    assert.ok(heartbeats.length <= 2, `${heartbeats.length} writes in 300ms`);
  });

  it("releases its waiting slot when done, so nothing leaks", async () => {
    const { svc } = setup({ recheckMs: 20 });
    await svc.next(p1, 100);
    assert.equal((svc as unknown as { waiters: Map<string, unknown> }).waiters.size, 0);
  });
});

describe("PrintingService.enqueueForOrder: from the order the kiosk just created", () => {
  it("builds the ticket from the order it is given, without reading the order again", async () => {
    const { svc, queue, reads } = setup();
    await svc.enqueueForOrder("r1", "o1", true, order());
    assert.ok(!reads.includes("order.findFirst"), "no second read of the order");
    assert.equal(queue.length, 1);
    const lines = decode(queue[0]!.payload).plain;
    assert.ok(lines.some((l) => l.startsWith("1 x Soupe du jour")), "still uses the French name");
    assert.ok(lines.includes("705"));
  });

  it("puts the lines in order even when the order arrives shuffled", async () => {
    const { svc, queue } = setup();
    const shuffled = order({ items: [...order().items].reverse() });
    await svc.enqueueForOrder("r1", "o1", true, shuffled);
    const text = decode(queue[0]!.payload).plain.join("\n");
    assert.ok(text.indexOf("Soupe du jour") < text.indexOf("Pie"));
  });

  it("does not trust an order that belongs to another restaurant", async () => {
    const { svc, queue } = setup();
    assert.equal(await svc.enqueueForOrder("r1", "o1", true, order({ restaurantId: "r2" })), null);
    assert.equal(queue.length, 0);
    await assert.rejects(svc.enqueueForOrder("r1", "o1", false, order({ restaurantId: "r2" })), (e: { getStatus?: () => number }) => e.getStatus?.() === 404);
  });

  it("skips quietly when the printer is off, even with the order in hand", async () => {
    const { svc, queue } = setup({ printers: [printer({ isEnabled: false })] });
    assert.equal(await svc.enqueueForOrder("r1", "o1", true, order()), null);
    assert.equal(queue.length, 0);
  });

  it("asks the database for everything at the same time, not one thing after another", async () => {
    // Every read and the insert take 100ms. The printer, the restaurant and the catalog names are
    // fetched together, so the whole thing is about 2 x 100. Fetched one after another it is 3 x 100 or more.
    const { svc, queue } = setup({ delayMs: 100 });
    const { ms } = await took(() => svc.enqueueForOrder("r1", "o1", true, order()));
    assert.equal(queue.length, 1);
    assert.ok(ms < 260, `took ${ms}ms: the lookups ran one after another`);
  });

  it("a failing lookup after an early exit never becomes an unhandled rejection", async () => {
    let unhandled = 0;
    const onUnhandled = () => { unhandled += 1; };
    process.on("unhandledRejection", onUnhandled);
    const { svc } = setup({ printers: [printer({ isEnabled: false })] });
    // make the catalog names lookup fail; the printer is off so the method returns before using them
    (svc as unknown as { prisma: { productPresentation: { findMany: () => Promise<never> } } }).prisma.productPresentation.findMany = async () => { throw new Error("db down"); };
    assert.equal(await svc.enqueueForOrder("r1", "o1", true, order()), null);
    await new Promise((r) => setTimeout(r, 50));
    process.off("unhandledRejection", onUnhandled);
    assert.equal(unhandled, 0);
  });
});
