import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ConflictException } from "@nestjs/common";
import { TABLE_TAKEN, TableOccupancyService, inFlightOnTable } from "../src/kiosk/table-occupancy.js";
import { OrdersService } from "../src/kiosk/orders.service.js";

/** A till whose GetActiveOrders answers with these open orders (or fails). */
function service({ inFlight = null as { reference: string } | null, till = [] as Record<string, unknown>[] | Error, returnCode = 0, part = null as string | null } = {}) {
  const queries: unknown[] = [];
  const calls: string[] = [];
  const prisma = {
    order: { findFirst: async (q: unknown) => { queries.push(q); return inFlight; } },
    orderTypeMapping: { findFirst: async () => (part === null ? null : { tablePart: part }) },
  };
  const clients = {
    forRestaurant: async () => ({
      client: {
        call: async (op: string) => {
          calls.push(op);
          if (till instanceof Error) throw till;
          return { ReturnCode: returnCode, ReturnMessage: returnCode ? "TPAPI configured for multiple databases" : "", Orders: till };
        },
      },
    }),
  };
  return { svc: new TableOccupancyService(prisma as never, clients as never), queries, calls };
}

describe("chevalet numbers in use", () => {
  it("is taken while unTill has a bill open on that table number", async () => {
    const { svc, calls } = service({ till: [{ TableNumber: 12, TablePart: "a", OrderName: "K1-1117-004" }, { TableNumber: "7", TablePart: "A" }] });
    assert.equal(await svc.isFree("r1", 7), false);
    assert.equal(await svc.isFree("r1", 12), false);
    assert.deepEqual(calls, ["GetActiveOrders", "GetActiveOrders"]);
  });

  it("only the table part kiosk orders go to counts: the cashier's bill on 12 a leaves chevalet 12 free when the kiosk uses b", async () => {
    const { svc } = service({ part: "b", till: [{ TableNumber: 12, TablePart: "a" }, { TableNumber: 14, TablePart: "b" }] });
    assert.equal(await svc.isFree("r1", 12), true);
    assert.equal(await svc.isFree("r1", 14), false);
  });

  it("no part set for Sur place means part a, as unTill uses", async () => {
    const { svc } = service({ part: "", till: [{ TableNumber: 12, TablePart: "a" }, { TableNumber: 14, TablePart: "b" }] });
    assert.equal(await svc.isFree("r1", 12), false);
    assert.equal(await svc.isFree("r1", 14), true);
  });

  it("is free once unTill no longer has it open", async () => {
    const { svc } = service({ till: [{ TableNumber: 12 }] });
    assert.equal(await svc.isFree("r1", 8), true);
  });

  it("is taken by a kiosk order on its way to unTill, without asking the till", async () => {
    const { svc, calls, queries } = service({ inFlight: { reference: "K2-1117-009" } });
    assert.equal(await svc.isFree("r1", 5), false);
    assert.deepEqual(calls, []);
    const where = (queries[0] as { where: Record<string, unknown> }).where;
    assert.equal(where.restaurantId, "r1");
    assert.equal(where.tableNumber, 5);
    assert.deepEqual(where.status, { in: ["AWAITING_PAYMENT", "PENDING"] });
  });

  it("does not hold the customer up when unTill cannot be asked", async () => {
    assert.equal(await service({ till: new Error("timeout") }).svc.isFree("r1", 5), true);
    assert.equal(await service({ till: [{ TableNumber: 5, TablePart: "a" }], returnCode: 1 }).svc.isFree("r1", 5), true);
  });

  it("refuses with TABLE_TAKEN", async () => {
    const { svc } = service({ till: [{ TableNumber: 3, TablePart: "a" }] });
    await assert.rejects(svc.assertFree("r1", 3), (e: unknown) =>
      e instanceof ConflictException && (e.getResponse() as { code: string }).code === TABLE_TAKEN);
    await svc.assertFree("r1", 4);
  });

  it("only counts recent orders as on their way", async () => {
    let q: { where: { createdAt: { gte: Date } } } | null = null;
    const now = Date.parse("2026-11-17T12:00:00Z");
    await inFlightOnTable({ order: { findFirst: async (a: never) => { q = a; return null; } } }, "r1", 5, now);
    assert.equal(q!.where.createdAt.gte.toISOString(), "2026-11-17T10:00:00.000Z");
  });
});

describe("an eat-in order on a chevalet number already in use", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function make({ openInTill = [] as number[], inFlightInTx = false } = {}) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const created: any[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx: any = {
      $executeRaw: async () => 1,
      orderCounter: { upsert: async () => ({ lastSequence: 4 }) },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      order: { findFirst: async () => (inFlightInTx ? { reference: "K1-1117-003" } : null), create: async (a: any) => { created.push(a.data); return { id: "o1", status: "PENDING", createdAt: new Date(), ...a.data, items: [] }; } },
      orderStatusHistory: { create: async () => ({}) },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prisma: any = {
      subscriptionPeriod: { findFirst: async () => ({ id: "running" }) },
      tpapiConnection: { findUnique: async () => ({ isEnabled: true, pingFailures: 0 }) },
      restaurant: { findUnique: async () => ({ id: "r1", name: "Chez", currency: "MAD", status: "ACTIVE", locale: "fr", settings: { eatInEnabled: true, askTableForEatIn: true } }) },
      order: { findFirst: async () => null },
      kiosk: { findFirst: async () => null },
      orderTypeMapping: { findFirst: async () => ({ tablePart: "" }) },
      tpapiSalesArea: { findFirst: async () => ({ tableRanges: [{ FromTable: 1, ToTable: 50 }] }) },
      restaurantSettings: { findFirst: async () => ({ askTableForEatIn: true }) },
      $transaction: async (fn: (t: unknown) => unknown) => fn(tx),
    };
    const clients = { forRestaurant: async () => ({ client: { call: async () => ({ ReturnCode: 0, ReturnMessage: "", Orders: openInTill.map((n) => ({ TableNumber: n, TablePart: "a" })) }) } }) };
    const tables = new TableOccupancyService(prisma, clients as never);
    const pricing = { price: async () => ({ total: 10, subtotal: 9, taxTotal: 1, itemCount: 1, salesAreaId: "1", priceLevelId: "2", currency: "MAD", lines: [] }) };
    const printing = { enqueueForOrder: async () => undefined };
    return { svc: new OrdersService(prisma, pricing as never, printing as never, {} as never, tables), created };
  }
  const dto = (tableNumber: number) => ({ clientOrderId: "11111111-1111-4111-8111-111111111111", orderType: "EAT_IN", salesAreaId: "1", lines: [], tableNumber }) as never;
  const takenError = (e: unknown) => e instanceof ConflictException && (e.getResponse() as { code: string }).code === TABLE_TAKEN;

  it("is refused while unTill has a bill open on it, and nothing is created", async () => {
    const { svc, created } = make({ openInTill: [12] });
    await assert.rejects(svc.create("chez", dto(12)), takenError);
    assert.equal(created.length, 0);
  });
  it("is refused when another borne just took it (seen under the lock)", async () => {
    const { svc, created } = make({ inFlightInTx: true });
    await assert.rejects(svc.create("chez", dto(12)), takenError);
    assert.equal(created.length, 0);
  });
  it("goes through on a free number", async () => {
    const { svc, created } = make({ openInTill: [12] });
    await svc.create("chez", dto(13));
    assert.equal(created[0].tableNumber, 13);
  });
});
