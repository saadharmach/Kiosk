import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { availableProviders, providerFor } from "../src/payments/payment-providers.js";
import { ABANDONED_ORDER_MS, PAYMENT_TIMEOUT_MS, PaymentsService, findCardTerminal } from "../src/payments/payments.service.js";
import { OrdersService } from "../src/kiosk/orders.service.js";
import { OrderSubmitService } from "../src/orders/order-submit.service.js";
import { PaymentSettingsService } from "../src/restaurant/payment-settings.service.js";

const R = "r1";
const was = process.env.PAYMENT_SIMULATOR;
before(() => { process.env.PAYMENT_SIMULATOR = "on"; });
after(() => { if (was === undefined) delete process.env.PAYMENT_SIMULATOR; else process.env.PAYMENT_SIMULATOR = was; });

const cardOn = { cardPaymentEnabled: true, cardUntillPaymentId: 5000000021n, cashPaymentEnabled: true, cashClosesOrder: false, cashUntillPaymentId: null };
const simTerminal = { id: "t1", name: "Borne 1 TPE", provider: "SIMULATOR", config: {} };

describe("can this borne take cards?", () => {
  const prisma = (t: any) => ({ paymentTerminal: { findFirst: async (a: any) => { assert.equal(a.where.restaurantId, R); return t; } } });
  it("only with card switched on, an unTill payment type chosen, a borne, and a switched-on terminal the server can use", async () => {
    assert.ok(await findCardTerminal(prisma(simTerminal), R, cardOn, "k1"));
    assert.equal(await findCardTerminal(prisma(simTerminal), R, { ...cardOn, cardPaymentEnabled: false }, "k1"), null);
    assert.equal(await findCardTerminal(prisma(simTerminal), R, { ...cardOn, cardUntillPaymentId: null }, "k1"), null);
    assert.equal(await findCardTerminal(prisma(simTerminal), R, cardOn, null), null, "a machine with no borne");
    assert.equal(await findCardTerminal(prisma(null), R, cardOn, "k1"), null, "no terminal on this borne");
    assert.equal(await findCardTerminal(prisma({ ...simTerminal, provider: "SOMETHING" }), R, cardOn, "k1"), null, "an unknown connection");
  });
  it("the simulator exists only where the server allows it (never on the live server)", () => {
    assert.ok(providerFor("SIMULATOR", { PAYMENT_SIMULATOR: "on" }));
    assert.equal(providerFor("SIMULATOR", {}), null);
    assert.deepEqual(availableProviders({}), []);
  });
});

/** The payments service on a stand-in database: orders, payments, and what was transitioned and printed. */
function paymentsSetup(order: any = { id: "o1", reference: "K1-1014-001", status: "AWAITING_PAYMENT" }, payments: any[] = []) {
  const rows = payments.map((p) => ({ restaurantId: R, orderId: "o1", provider: "SIMULATOR", message: null, ...p }));
  const transitions: any[] = [];
  const printed: string[] = [];
  const started: any[] = [];
  const match = (r: any, w: any) => Object.entries(w).every(([k, v]) => (v && typeof v === "object" && "lt" in (v as any) ? r[k] < (v as any).lt : r[k] === v));
  const prisma: any = {
    payment: {
      findFirst: async (a: any) => rows.filter((r) => match(r, a.where)).at(-1) ?? null,
      findMany: async (a: any) => rows.filter((r) => match(r, a.where)).map((r) => ({ ...r, terminal: simTerminal })),
      create: async (a: any) => { const r = { id: `p${rows.length + 1}`, status: "PENDING", message: null, createdAt: new Date(), ...a.data }; rows.push(r); return r; },
      updateMany: async (a: any) => { let count = 0; for (const r of rows) if (match(r, a.where)) { Object.assign(r, a.data); count++; } return { count }; },
    },
    order: {
      findFirst: async () => order,
      findMany: async (a: any) => (order.status === a.where.status && order.updatedAt < a.where.updatedAt.lt && !rows.some((p) => p.status === "PENDING") ? [{ id: order.id, restaurantId: R }] : []),
    },
  };
  const status: any = { transition: async (t: any) => { transitions.push(t); order.status = t.to; } };
  const printing: any = { enqueueForOrder: async (_r: string, id: string) => { printed.push(id); } };
  const svc = new PaymentsService(prisma, status, printing);
  const terminal: any = { ...simTerminal, use: { start: async (c: any) => { started.push(c); }, cancel: async () => {} } };
  return { svc, rows, transitions, printed, started, terminal, order };
}

describe("a card payment", () => {
  it("asks the TPE for the order's total (the server's figure), once: a second ask gives back the one waiting", async () => {
    const { svc, rows, started, terminal } = paymentsSetup();
    const p1 = await svc.startCard(R, { id: "o1", reference: "K1-1014-001", total: 42.5, currency: "MAD" }, terminal);
    const p2 = await svc.startCard(R, { id: "o1", reference: "K1-1014-001", total: 42.5, currency: "MAD" }, terminal);
    assert.equal(p1.id, p2.id);
    assert.equal(rows.length, 1);
    assert.deepEqual([started.length, started[0].amount, started[0].reference], [1, 42.5, "K1-1014-001"]);
  });

  it("a TPE that cannot be asked fails the payment at once, with the reason", async () => {
    const { svc, terminal } = paymentsSetup();
    terminal.use.start = async () => { throw new Error("USB unplugged"); };
    const p: any = await svc.startCard(R, { id: "o1", reference: "x", total: 1, currency: "MAD" }, terminal);
    assert.equal(p.status, "FAILED");
    assert.match(p.message, /could not be reached: USB unplugged/);
  });

  it("approved: the order goes on to unTill and its ticket prints", async () => {
    const { svc, transitions, printed, rows } = paymentsSetup(undefined, [{ id: "p1", status: "PENDING" }]);
    await svc.complete(R, "p1", { approved: true, providerRef: "TX-77" });
    assert.equal(rows[0].status, "APPROVED");
    assert.equal(rows[0].providerRef, "TX-77");
    assert.deepEqual(transitions.map((t) => [t.to, t.reason]), [["PENDING", "Paid by card"]]);
    assert.deepEqual(printed, ["o1"]);
  });

  it("declined: the order keeps waiting for the customer's next choice; nothing is sent or printed", async () => {
    const { svc, transitions, printed, rows, order } = paymentsSetup(undefined, [{ id: "p1", status: "PENDING" }]);
    await svc.complete(R, "p1", { approved: false, message: "Carte refusée" });
    assert.equal(rows[0].status, "DECLINED");
    assert.equal(order.status, "AWAITING_PAYMENT");
    assert.equal(transitions.length + printed.length, 0);
  });

  it("a repeated or late answer changes nothing", async () => {
    const { svc, transitions } = paymentsSetup(undefined, [{ id: "p1", status: "CANCELLED" }]);
    await svc.complete(R, "p1", { approved: true });
    assert.equal(transitions.length, 0);
  });

  it("approved after the order was given up: nothing goes to unTill, and the payment says to refund", async () => {
    const { svc, transitions, rows } = paymentsSetup({ id: "o1", reference: "x", status: "CANCELLED" }, [{ id: "p1", status: "PENDING" }]);
    await svc.complete(R, "p1", { approved: true });
    assert.equal(transitions.length, 0);
    assert.match(rows[0].message, /refund the customer/);
  });

  it("the test buttons work only where the simulator is allowed", async () => {
    const { svc } = paymentsSetup(undefined, [{ id: "p1", status: "PENDING" }]);
    process.env.PAYMENT_SIMULATOR = "";
    await assert.rejects(svc.simulate(R, "o1", true), ForbiddenException);
    process.env.PAYMENT_SIMULATOR = "on";
    await svc.simulate(R, "o1", true);
  });

  it("a TPE that never answers fails after the time limit; an order nobody came back to is cancelled", async () => {
    const now = Date.now();
    const { svc, rows, transitions } = paymentsSetup({ id: "o1", status: "AWAITING_PAYMENT", updatedAt: new Date(now - ABANDONED_ORDER_MS - 1) }, [{ id: "p1", status: "PENDING", createdAt: new Date(now - PAYMENT_TIMEOUT_MS - 1) }]);
    await svc.expire(now);
    assert.equal(rows[0].status, "FAILED");
    assert.match(rows[0].message, /did not answer in time/);
    assert.deepEqual(transitions.map((t) => t.to), ["CANCELLED"]);
  });
});

describe("ordering with a way to pay", () => {
  function make(settings: any, terminal: any = simTerminal) {
    const created: any[] = [];
    const printed: string[] = [];
    const startedCard: any[] = [];
    const tx: any = {
      $executeRaw: async () => 1,
      orderCounter: { upsert: async () => ({ lastSequence: 1 }) },
      order: { create: async (a: any) => { created.push(a.data); return { id: "o1", createdAt: new Date(), ...a.data, items: [] }; } },
      orderStatusHistory: { create: async () => ({}) },
    };
    const prisma: any = {
      ...tx,
      subscriptionPeriod: { findFirst: async () => ({ id: "running" }) },
      tpapiConnection: { findUnique: async () => ({ isEnabled: true, pingFailures: 0 }) },
      restaurant: { findUnique: async () => ({ id: R, name: "Chez", currency: "MAD", status: "ACTIVE", locale: "fr", settings: { takeAwayEnabled: true, ...settings } }) },
      order: { findFirst: async () => null, create: tx.order.create },
      kiosk: { findFirst: async () => ({ id: "k1", code: "K1", name: "Borne 1", isEnabled: true }) },
      orderTypeMapping: { findFirst: async () => ({ fixedTableNumber: 3001, tablePart: "a" }) },
      paymentTerminal: { findFirst: async () => terminal },
      $transaction: async (fn: any) => fn(tx),
    };
    const pricing: any = { price: async () => ({ total: 42.5, subtotal: 40, taxTotal: 2.5, itemCount: 1, salesAreaId: "1", priceLevelId: "2", currency: "MAD", lines: [] }) };
    const printing: any = { enqueueForOrder: async (_r: string, id: string) => { printed.push(id); } };
    const payments = new PaymentsService(prisma, {} as never, printing);
    payments.startCard = async (_r: string, order: any) => { startedCard.push(order); return { id: "p1", status: "PENDING", message: null } as never; };
    return { svc: new OrdersService(prisma, pricing, printing, payments), created, printed, startedCard };
  }
  const dto = (extra: any = {}) => ({ clientOrderId: "11111111-1111-4111-8111-111111111111", orderType: "TAKE_AWAY", salesAreaId: "1", lines: [], borneCode: "K1", ...extra }) as never;

  it("card: the order waits for the TPE, is not printed yet, and will be closed in unTill with the card payment type", async () => {
    const { svc, created, printed, startedCard } = make(cardOn);
    const out: any = await svc.create("chez", dto({ payment: "CARD" }));
    assert.equal(created[0].status, "AWAITING_PAYMENT");
    assert.equal(created[0].paymentMethod, "PAYMENT_TERMINAL");
    assert.deepEqual([created[0].closeInUntill, created[0].untillPaymentId], [true, 5000000021n]);
    assert.deepEqual(printed, []);
    assert.equal(startedCard.length, 1);
    assert.deepEqual([out.payment.by, out.payment.paid, out.payment.attempt.status], ["CARD", false, "PENDING"]);
  });

  it("card where this borne cannot take cards: refused, nothing created", async () => {
    const { svc, created } = make(cardOn, null);
    await assert.rejects(svc.create("chez", dto({ payment: "CARD" })), BadRequestException);
    assert.equal(created.length, 0);
  });

  it("cash, as before: open in unTill to be paid at the counter, and printed at once", async () => {
    const { svc, created, printed } = make(cardOn);
    await svc.create("chez", dto({ payment: "CASH" }));
    assert.deepEqual([created[0].status, created[0].paymentMethod, created[0].closeInUntill], ["PENDING", "PAY_AT_CASHIER", false]);
    assert.deepEqual(printed, ["o1"]);
  });

  it("cash, where the restaurant chose to close it at once: closed with the cash payment type", async () => {
    const { svc, created } = make({ ...cardOn, cashClosesOrder: true, cashUntillPaymentId: 5000000031n });
    await svc.create("chez", dto({ payment: "CASH" }));
    assert.deepEqual([created[0].closeInUntill, created[0].untillPaymentId], [true, 5000000031n]);
  });

  it("a kiosk page that does not say how (older ones) is cash; cash switched off is refused", async () => {
    const a = make(cardOn);
    await a.svc.create("chez", dto());
    assert.equal(a.created[0].paymentMethod, "PAY_AT_CASHIER");
    const b = make({ ...cardOn, cashPaymentEnabled: false });
    await assert.rejects(b.svc.create("chez", dto({ payment: "CASH" })), /Cash payment is not available/);
  });
});

describe("closing in unTill", () => {
  function make(order: any, answer: any) {
    const calls: any[] = [];
    const transitions: any[] = [];
    const updates: any[] = [];
    const prisma: any = {
      order: { findFirst: async () => order, updateMany: async (a: any) => { updates.push(a); return { count: 1 }; } },
      integrationLog: { create: async () => ({}) },
      orderTypeMapping: { findFirst: async () => ({ tablePart: "a" }) },
    };
    const clients: any = { forRestaurant: async () => ({ client: { call: async (op: string, req: any) => { calls.push({ op, req }); if (answer instanceof Error) throw answer; return answer; } } }) };
    const status: any = { transition: async (t: any) => { transitions.push(t); return t; } };
    return { svc: new OrderSubmitService(prisma, clients, status), calls, transitions, updates };
  }
  const sent = { id: "o1", reference: "K1-1014-001", status: "SENT", closeInUntill: true, closedInUntillAt: null, untillPaymentId: 5000000021n, tableNumber: 3001, tablePart: "", orderType: "TAKE_AWAY", tpapiRequestSnapshot: { TablePart: "b" } };

  it("CloseOrder with the order's own table and part, and the chosen payment type; then the order is PAID", async () => {
    const { svc, calls, transitions } = make({ ...sent }, { ReturnCode: 0, ReturnMessage: "" });
    await svc.close(R, "o1");
    assert.deepEqual(calls, [{ op: "CloseOrder", req: { TableNumber: 3001, TablePart: "b", PaymentId: 5000000021, Extra: [] } }]);
    assert.equal(transitions[0].to, "PAID");
    assert.ok(transitions[0].patch.closedInUntillAt instanceof Date);
  });

  it("unTill refuses: the order stays SENT with the reason, to be tried again", async () => {
    const { svc, transitions, updates } = make({ ...sent }, { ReturnCode: 2, ReturnMessage: "Table not found" });
    await assert.rejects(svc.close(R, "o1"));
    assert.equal(transitions.length, 0);
    assert.match(updates[0].data.tpapiLastError, /Closing in unTill: unTill returned 2: Table not found/);
    assert.deepEqual(updates[0].where, { id: "o1", restaurantId: R });
  });

  it("only an order that is sent, meant to be closed, and not closed yet", async () => {
    await assert.rejects(make({ ...sent, status: "CONFIRMED" }, {}).svc.close(R, "o1"), /not waiting to be closed/);
    await assert.rejects(make({ ...sent, closeInUntill: false }, {}).svc.close(R, "o1"), /not waiting to be closed/);
    await assert.rejects(make({ ...sent, untillPaymentId: null }, {}).svc.close(R, "o1"), /no unTill payment type/);
  });
});

describe("the back office's payment settings", () => {
  function make() {
    const writes: any[] = [];
    const prisma: any = {
      restaurantSettings: { findUnique: async () => null, upsert: async (a: any) => { writes.push(a); return {}; } },
      tpapiPayment: { findMany: async (a: any) => [{ untillId: 5000000021n, number: 2, name: "Card", kind: 1 }, { untillId: 5000000031n, number: 1, name: "Cash", kind: 0 }].filter((p) => !a.where.untillId || a.where.untillId.in.includes(p.untillId)) },
      kiosk: { findMany: async () => [] },
      paymentTerminal: { findMany: async () => [] },
    };
    return { svc: new PaymentSettingsService(prisma), writes };
  }
  const base = { cardEnabled: true, cardUntillPaymentId: "5000000021", cashEnabled: true, cashUntillPaymentId: null, cashClosesOrder: false };
  it("saves a sound choice, scoped to the restaurant", async () => {
    const { svc, writes } = make();
    await svc.update(R, base);
    assert.equal(writes[0].where.restaurantId, R);
    assert.equal(writes[0].update.cardUntillPaymentId, 5000000021n);
  });
  it("refuses: no way to pay at all; card without its payment type; closing cash without one; another restaurant's payment type", async () => {
    const { svc, writes } = make();
    await assert.rejects(svc.update(R, { ...base, cardEnabled: false, cashEnabled: false }), /at least one way to pay/);
    await assert.rejects(svc.update(R, { ...base, cardUntillPaymentId: null }), /Card: choose/);
    await assert.rejects(svc.update(R, { ...base, cashClosesOrder: true }), /Cash: choose/);
    await assert.rejects(svc.update(R, { ...base, cardUntillPaymentId: "999" }), /not one of this restaurant's/);
    assert.equal(writes.length, 0);
  });
});
