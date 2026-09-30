import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OrderStatusService, type OrderStatusName } from "../src/orders/order-status.service.js";

const ALL: OrderStatusName[] = ["DRAFT", "PENDING", "SENT", "CONFIRMED", "PAID", "FAILED", "CANCELLED"];

describe("order status machine: the rules", () => {
  it("lists exactly the legal moves", () => {
    assert.deepEqual(OrderStatusService.allowedFrom("DRAFT"), ["PENDING", "CANCELLED"]);
    assert.deepEqual(OrderStatusService.allowedFrom("PENDING"), ["SENT", "FAILED", "CANCELLED"]);
    assert.deepEqual(OrderStatusService.allowedFrom("SENT"), ["CONFIRMED", "FAILED", "CANCELLED"]);
    assert.deepEqual(OrderStatusService.allowedFrom("CONFIRMED"), ["PAID", "CANCELLED"]);
    assert.deepEqual(OrderStatusService.allowedFrom("FAILED"), ["PENDING", "CANCELLED"]);
  });

  it("has two final states that can never change", () => {
    for (const s of ["PAID", "CANCELLED"] as const) {
      assert.equal(OrderStatusService.isTerminal(s), true);
      for (const to of ALL) assert.equal(OrderStatusService.can(s, to), false, `${s} -> ${to}`);
    }
    for (const s of ["DRAFT", "PENDING", "SENT", "CONFIRMED", "FAILED"] as const) assert.equal(OrderStatusService.isTerminal(s), false);
  });

  it("never lets a confirmed order go back to an earlier state", () => {
    for (const to of ["DRAFT", "PENDING", "SENT", "FAILED"] as const) assert.equal(OrderStatusService.can("CONFIRMED", to), false);
  });

  it("the only way out of FAILED is a retry (PENDING) or a cancel", () => {
    assert.deepEqual(OrderStatusService.allowedFrom("FAILED"), ["PENDING", "CANCELLED"]);
  });

  it("unknown statuses allow nothing", () => {
    assert.deepEqual(OrderStatusService.allowedFrom("BOGUS" as never), []);
  });
});

/** A fake database holding one order, recording every write with its where clause. */
function setup(status: OrderStatusName, opts: { lostRace?: boolean } = {}) {
  const writes: { op: string; where?: Record<string, unknown>; data: Record<string, unknown> }[] = [];
  const history: Record<string, unknown>[] = [];
  const order = { id: "o1", reference: "K0-1", status, updatedAt: new Date() };
  const tx = {
    order: {
      updateMany: async (a: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        writes.push({ op: "updateMany", ...a });
        return { count: opts.lostRace ? 0 : 1 };
      },
      findUniqueOrThrow: async () => ({ ...order, status: writes.at(-1)?.data.status ?? status }),
    },
    orderStatusHistory: { create: async (a: { data: Record<string, unknown> }) => { history.push(a.data); } },
  };
  const finds: Record<string, unknown>[] = [];
  const prisma = {
    order: {
      findFirst: async (a: { where: Record<string, unknown> }) => {
        finds.push(a.where);
        return a.where.restaurantId === "r1" && a.where.id === "o1" ? order : null;
      },
    },
    $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
  };
  return { svc: new OrderStatusService(prisma as never), writes, history, finds };
}

const go = (svc: OrderStatusService, to: OrderStatusName, extra: Record<string, unknown> = {}) =>
  svc.transition({ restaurantId: "r1", orderId: "o1", to, actor: "SYSTEM", ...extra });

describe("order status machine: transitions", () => {
  it("moves an order, stamps the matching time and writes the history, together", async () => {
    const { svc, writes, history } = setup("PENDING");
    const r = await go(svc, "SENT", { reason: "CreateOrder accepted" });
    assert.equal(r.status, "SENT");
    assert.equal(r.changed, true);
    assert.equal(writes.length, 1);
    assert.ok(writes[0]!.data.sentAt instanceof Date, "sentAt is stamped on arrival at SENT");
    assert.equal(history.length, 1);
    assert.equal(history[0]!.fromStatus, "PENDING");
    assert.equal(history[0]!.toStatus, "SENT");
    assert.equal(history[0]!.reason, "CreateOrder accepted");
  });

  it("stamps the right column for each status", async () => {
    for (const [from, to, col] of [["SENT", "CONFIRMED", "confirmedAt"], ["PENDING", "FAILED", "failedAt"], ["CONFIRMED", "CANCELLED", "cancelledAt"], ["CONFIRMED", "PAID", "paidDetectedAt"]] as const) {
      const { svc, writes } = setup(from);
      await go(svc, to);
      assert.ok(writes[0]!.data[col] instanceof Date, `${from} -> ${to} stamps ${col}`);
    }
  });

  it("writes extra columns in the same update, without overriding a value it was given", async () => {
    const when = new Date("2026-01-01");
    const { svc, writes } = setup("PENDING");
    await go(svc, "SENT", { patch: { tpapiAttempts: 2, sentAt: when } });
    assert.equal(writes[0]!.data.tpapiAttempts, 2);
    assert.equal(writes[0]!.data.sentAt, when);
  });

  it("is a harmless no-op when the order already has that status", async () => {
    const { svc, writes, history } = setup("CANCELLED");
    const r = await go(svc, "CANCELLED");
    assert.equal(r.changed, false);
    assert.equal(writes.length + history.length, 0);
  });

  it("rejects an illegal move with a clear message, and writes nothing", async () => {
    const { svc, writes, history } = setup("CONFIRMED");
    await assert.rejects(go(svc, "PENDING"), (e: { getStatus?: () => number; message: string }) => {
      assert.equal(e.getStatus?.(), 400);
      assert.match(e.message, /cannot go from CONFIRMED to PENDING/);
      return true;
    });
    assert.equal(writes.length + history.length, 0);
  });

  it("says when a status is final", async () => {
    const { svc } = setup("PAID");
    await assert.rejects(go(svc, "CANCELLED"), /final/);
  });

  it("answers 404 for an order that belongs to another restaurant, and never touches it", async () => {
    const { svc, writes } = setup("PENDING");
    await assert.rejects(
      svc.transition({ restaurantId: "someone-else", orderId: "o1", to: "SENT", actor: "SYSTEM" }),
      (e: { getStatus?: () => number }) => e.getStatus?.() === 404,
    );
    assert.equal(writes.length, 0);
  });

  it("scopes both the lookup and the write by restaurant, and locks on the old status", async () => {
    const { svc, writes, finds } = setup("PENDING");
    await go(svc, "SENT");
    assert.equal(finds[0]!.restaurantId, "r1");
    assert.equal(writes[0]!.where!.restaurantId, "r1");
    assert.equal(writes[0]!.where!.status, "PENDING"); // optimistic lock
  });

  it("answers 409 when someone else changed the order first", async () => {
    const { svc, history } = setup("PENDING", { lostRace: true });
    await assert.rejects(go(svc, "SENT"), (e: { getStatus?: () => number; message: string }) => {
      assert.equal(e.getStatus?.(), 409);
      assert.match(e.message, /changed status while/);
      return true;
    });
    assert.equal(history.length, 0, "no history row for a write that did not happen");
  });
});
