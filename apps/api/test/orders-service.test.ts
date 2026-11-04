import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OrdersService } from "../src/kiosk/orders.service.js";

interface Captured { dto?: Record<string, unknown>; printed: string[] }

function setup(settings: Record<string, unknown> | null, restaurantLocale = "fr", subscribed = true, tillDown = false) {
  const captured: Captured = { printed: [] };
  const restaurant = { id: "r1", currency: "MAD", status: "ACTIVE", locale: restaurantLocale, settings };
  const prisma = {
    subscriptionPeriod: { findFirst: async () => (subscribed ? { id: "running" } : null) },
    tpapiConnection: { findUnique: async () => ({ isEnabled: true, pingFailures: tillDown ? 2 : 0 }) },
    restaurant: { findUnique: async () => restaurant },
    order: { findFirst: async () => null },
  };
  const pricing = {
    price: async (_rid: string, _cur: string, dto: Record<string, unknown>) => { captured.dto = dto; return { total: 1, lines: [] }; },
  };
  const printing = { enqueueForOrder: async (_r: string, id: string) => { captured.printed.push(id); } };
  return { svc: new OrdersService(prisma as never, pricing as never, printing as never, {} as never), captured };
}

const dto = (orderType: string, extra: Record<string, unknown> = {}) => ({ orderType, salesAreaId: "1", lines: [], ...extra }) as never;
const all = { eatInEnabled: true, takeAwayEnabled: true, deliveryEnabled: true };

describe("OrdersService.preview: which order types can be priced", () => {
  it("prices an enabled order type", async () => {
    const { svc } = setup(all);
    await assert.doesNotReject(svc.preview("resto-a", dto("TAKE_AWAY")));
  });

  it("rejects a disabled order type before pricing anything", async () => {
    const { svc, captured } = setup({ ...all, deliveryEnabled: false });
    await assert.rejects(svc.preview("resto-a", dto("DELIVERY")), (e: { getStatus?: () => number; message: string }) => {
      assert.equal(e.getStatus?.(), 400);
      assert.match(e.message, /DELIVERY is not enabled/);
      return true;
    });
    assert.equal(captured.dto, undefined);
  });

  it("uses the defaults when the restaurant has no settings row: eat-in on, the others off", async () => {
    const { svc } = setup(null);
    await assert.doesNotReject(svc.preview("resto-a", dto("EAT_IN")));
    await assert.rejects(svc.preview("resto-a", dto("TAKE_AWAY")), /not enabled/);
    await assert.rejects(svc.preview("resto-a", dto("DELIVERY")), /not enabled/);
  });

  it("rejects each disabled type independently", async () => {
    for (const [type, flag] of [["EAT_IN", "eatInEnabled"], ["TAKE_AWAY", "takeAwayEnabled"], ["DELIVERY", "deliveryEnabled"]] as const) {
      const { svc } = setup({ ...all, [flag]: false });
      await assert.rejects(svc.preview("resto-a", dto(type)), /not enabled/, type);
    }
  });
});

describe("OrdersService.preview: the customer's language", () => {
  it("passes the language the kiosk sent", async () => {
    const { svc, captured } = setup(all, "fr");
    await svc.preview("resto-a", dto("EAT_IN", { locale: "ar" }));
    assert.equal(captured.dto!.locale, "ar");
  });

  it("uses the restaurant's own language when none is sent", async () => {
    const { svc, captured } = setup(all, "en");
    await svc.preview("resto-a", dto("EAT_IN"));
    assert.equal(captured.dto!.locale, "en");
  });

  it("falls back to French if the restaurant's language is not supported", async () => {
    const { svc, captured } = setup(all, "de");
    await svc.preview("resto-a", dto("EAT_IN"));
    assert.equal(captured.dto!.locale, "fr");
  });
});

describe("OrdersService.create: idempotency", () => {
  it("returns the existing order for a repeated clientOrderId, without pricing, without a second ticket", async () => {
    const captured: Captured = { printed: [] };
    const existing = {
      reference: "K0-0930-001", status: "PENDING", orderType: "EAT_IN", tableNumber: 705, total: 5, currency: "MAD",
      itemCount: 1, createdAt: new Date(), items: [],
    };
    const prisma = {
      subscriptionPeriod: { findFirst: async () => ({ id: "running" }) }, // a running subscription, unless a test says otherwise
      tpapiConnection: { findUnique: async () => ({ isEnabled: true, pingFailures: 0 }) }, // the till answers
      restaurant: { findUnique: async () => ({ id: "r1", currency: "MAD", status: "ACTIVE", locale: "fr", settings: all }) },
      order: { findFirst: async (a: { where: Record<string, unknown> }) => (a.where.clientRequestId === "same-id" ? existing : null) },
    };
    const pricing = { price: async () => { captured.dto = {}; return {}; } };
    const printing = { enqueueForOrder: async (_r: string, id: string) => { captured.printed.push(id); } };
    const svc = new OrdersService(prisma as never, pricing as never, printing as never, {} as never);
    const order = await svc.create("resto-a", { clientOrderId: "same-id", orderType: "EAT_IN", salesAreaId: "1", lines: [] } as never);
    assert.equal(order.reference, "K0-0930-001");
    assert.equal(captured.dto, undefined, "pricing was not called");
    assert.deepEqual(captured.printed, [], "no second ticket for a repeated tap");
  });
});

describe("without a running subscription", () => {
  const unavailable = (e: any) => e.getStatus?.() === 503 && e.getResponse?.().code === "RESTAURANT_UNAVAILABLE";
  it("a price quote and an order get the calm 'unavailable' answer, and nothing is priced or printed", async () => {
    const { svc, captured } = setup(all, "fr", false);
    await assert.rejects(svc.preview("resto-a", dto("TAKE_AWAY")), unavailable);
    await assert.rejects(svc.create("resto-a", dto("TAKE_AWAY", { clientOrderId: "11111111-1111-4111-8111-111111111111" })), unavailable);
    assert.equal(captured.dto, undefined);
    assert.deepEqual(captured.printed, []);
  });
});

describe("while the till does not answer", () => {
  const noConnection = (e: any) => e.getStatus?.() === 503 && e.getResponse?.().code === "TILL_UNREACHABLE";
  it("a price quote and a new order get the 'no connection' answer, and nothing is priced or printed", async () => {
    const { svc, captured } = setup(all, "fr", true, true);
    await assert.rejects(svc.preview("resto-a", dto("TAKE_AWAY")), noConnection);
    await assert.rejects(svc.create("resto-a", dto("TAKE_AWAY", { clientOrderId: "11111111-1111-4111-8111-111111111111" })), noConnection);
    assert.equal(captured.dto, undefined);
    assert.deepEqual(captured.printed, []);
  });

  it("an order already placed is still given back when the kiosk asks again (the till check comes after)", async () => {
    const existing = { reference: "K0-0930-001", status: "PENDING", orderType: "EAT_IN", tableNumber: 705, total: 5, currency: "MAD", itemCount: 1, createdAt: new Date(), items: [] };
    const prisma = {
      subscriptionPeriod: { findFirst: async () => ({ id: "running" }) },
      tpapiConnection: { findUnique: async () => ({ isEnabled: true, pingFailures: 5 }) },
      restaurant: { findUnique: async () => ({ id: "r1", currency: "MAD", status: "ACTIVE", locale: "fr", settings: all }) },
      order: { findFirst: async () => existing },
    };
    const svc = new OrdersService(prisma as never, {} as never, { enqueueForOrder: async () => undefined } as never, {} as never);
    assert.equal((await svc.create("resto-a", { clientOrderId: "same-id", orderType: "EAT_IN", salesAreaId: "1", lines: [] } as never)).reference, "K0-0930-001");
  });

  it("one lost ping is not an outage; a connection switched off by the platform team is", async () => {
    const { tillReachable } = await import("../src/common/till-health.js");
    assert.equal(tillReachable({ isEnabled: true, pingFailures: 0 }), true);
    assert.equal(tillReachable({ isEnabled: true, pingFailures: 1 }), true);
    assert.equal(tillReachable({ isEnabled: true, pingFailures: 2 }), false);
    assert.equal(tillReachable({ isEnabled: false, pingFailures: 0 }), false);
    assert.equal(tillReachable(null), false);
  });
});
