import assert from "node:assert/strict";
import { describe, it } from "node:test";
import "reflect-metadata";
import { NotFoundException } from "@nestjs/common";
import { AdminOrdersService } from "../src/admin/admin-orders.service.js";
import { TillLogService } from "../src/admin/till-log.service.js";
import { RestaurantOrdersService } from "../src/restaurant/restaurant-orders.service.js";
import { model, type Call } from "./helpers/fake-prisma.js";

Object.assign(process.env, {
  DATABASE_URL: "postgres://test", DIRECT_URL: "postgres://test", JWT_SECRET: "test-secret-".padEnd(40, "x"), ENCRYPTION_KEY: "0".repeat(64),
});
const { ROLES_KEY } = await import("../src/auth/decorators/roles.decorator.js");
const { AdminOrdersController } = await import("../src/admin/admin-orders.controller.js");

const actor = { id: "admin-1" };

describe("the platform team's view of a restaurant's orders", () => {
  function setup(restaurantExists = true) {
    const calls: { fn: string; args: unknown[] }[] = [];
    const audits: any[] = [];
    const orders = {
      list: async (...a: unknown[]) => { calls.push({ fn: "list", args: a }); return { orders: [] }; },
      detail: async (...a: unknown[]) => { calls.push({ fn: "detail", args: a }); return { id: "o1" }; },
      retry: async (...a: unknown[]) => { calls.push({ fn: "retry", args: a }); return { status: "PENDING" }; },
    };
    const submitter = { verify: async (...a: unknown[]) => { calls.push({ fn: "verify", args: a }); return { reference: "K0-1", confirmed: true }; } };
    const prisma = { restaurant: { findUnique: async () => (restaurantExists ? { id: "r1" } : null) } };
    const svc = new AdminOrdersService(prisma as never, orders as never, submitter as never, { record: async (e: unknown) => { audits.push(e); } } as never);
    return { svc, calls, audits };
  }

  it("reads through the same code as the restaurant's own back office, always for this restaurant", async () => {
    const { svc, calls } = setup();
    await svc.list("r1", { status: "FAILED" });
    await svc.detail("r1", "o1");
    assert.deepEqual(calls.map((c) => [c.fn, c.args[0]]), [["list", "r1"], ["detail", "r1"]]);
  });

  it("an unknown restaurant is not found, and nothing is read", async () => {
    const { svc, calls } = setup(false);
    await assert.rejects(svc.list("nope", {}), NotFoundException);
    await assert.rejects(svc.detail("nope", "o1"), NotFoundException);
    assert.equal(calls.length, 0);
  });

  it("re-checking the till and retrying are done as the platform user, scoped to the restaurant, and audited", async () => {
    const { svc, calls, audits } = setup();
    await svc.verify("r1", "o1", actor);
    await svc.retry("r1", "o1", actor);
    assert.deepEqual(calls.find((c) => c.fn === "verify")!.args, ["r1", "o1"]);
    assert.deepEqual(calls.find((c) => c.fn === "retry")!.args, ["r1", "o1", "admin-1", "PLATFORM_USER"]);
    assert.deepEqual(audits.map((a) => [a.action, a.restaurantId, a.actorType, a.actorId, a.entityId]), [
      ["order.verify", "r1", "PLATFORM_USER", "admin-1", "o1"],
      ["order.retry", "r1", "PLATFORM_USER", "admin-1", "o1"],
    ]);
  });
});

describe("who may do what with orders", () => {
  const proto = (AdminOrdersController as never as { prototype: Record<string, object> }).prototype;
  const roles = (name: string) => Reflect.getMetadata(ROLES_KEY, proto[name]!) as string[] | undefined;

  it("reading is open to every platform role", () => {
    for (const name of ["list", "detail", "tillLog"]) assert.equal(roles(name), undefined, name);
  });
  it("re-checking the till (read-only) is open to support; retrying (which can make the kitchen cook it twice) is SUPER_ADMIN only", () => {
    assert.deepEqual(roles("verify")!.sort(), ["SUPER_ADMIN", "SUPPORT"]);
    assert.deepEqual(roles("retry"), ["SUPER_ADMIN"]);
  });
});

describe("the till log", () => {
  const rows = [
    { id: "l1", createdAt: new Date("2026-10-01T10:00:00Z"), kind: "TPAPI", operation: "CreateOrder", ok: false, level: "ERROR", returnCode: 12, message: "table busy", durationMs: 800, orderId: "o1", correlationId: "c1" },
    { id: "l2", createdAt: new Date("2026-10-01T09:00:00Z"), kind: "TPAPI", operation: "Ping", ok: true, level: "INFO", returnCode: 0, message: null, durationMs: 90, orderId: null, correlationId: "c2" },
  ];
  function setup(exists = true) {
    const calls: Call[] = [];
    const prisma = {
      restaurant: { findUnique: async () => (exists ? { id: "r1" } : null) },
      integrationLog: {
        count: async (a: unknown) => { calls.push({ model: "integrationLog", op: "count", args: a }); return 2; },
        findMany: async (a: unknown) => { calls.push({ model: "integrationLog", op: "findMany", args: a }); return rows; },
      },
      order: model([{ id: "o1", restaurantId: "r1", reference: "K0-1001-002" }], calls, "order"),
    };
    return { svc: new TillLogService(prisma as never), calls };
  }

  it("shows each call with the order's reference, and nothing from the stored request or response", async () => {
    const { svc, calls } = setup();
    const out = await svc.list("r1");
    assert.deepEqual(out.items.map((i) => [i.operation, i.ok, i.orderReference]), [["CreateOrder", false, "K0-1001-002"], ["Ping", true, null]]);
    const q = calls.find((c) => c.op === "findMany" && c.model === "integrationLog")!.args as any;
    assert.equal(q.select.requestSummary, undefined);
    assert.equal(q.select.responseSummary, undefined);
    assert.equal(JSON.stringify(out).includes("Summary"), false);
  });

  it("every query is scoped to the restaurant, newest first, and can show only failures", async () => {
    const { svc, calls } = setup();
    await svc.list("r1", { failuresOnly: true });
    for (const c of calls.filter((x) => x.model === "integrationLog")) assert.deepEqual({ r: (c.args as any).where.restaurantId, ok: (c.args as any).where.ok }, { r: "r1", ok: false });
    assert.deepEqual((calls.find((c) => c.op === "findMany" && c.model === "integrationLog")!.args as any).orderBy, { createdAt: "desc" });
    assert.equal((calls.find((c) => c.model === "order")!.args as any).where.restaurantId, "r1");
  });

  it("an unknown restaurant is not found", async () => {
    await assert.rejects(setup(false).svc.list("nope"), NotFoundException);
  });

  it("pages are bounded", async () => {
    const { svc, calls } = setup();
    await svc.list("r1", { page: -4, pageSize: 5000 });
    const q = calls.find((c) => c.op === "findMany" && c.model === "integrationLog")!.args as any;
    assert.equal(q.skip, 0);
    assert.equal(q.take, 100);
  });
});

describe("retrying a failed order", () => {
  const make = (status: string) => {
    const transitions: any[] = [];
    const prisma = { order: { findFirst: async (a: any) => (a.where.restaurantId === "r1" ? { status, reference: "K0-1" } : null) } };
    const svc = new RestaurantOrdersService(prisma as never, { transition: async (t: unknown) => { transitions.push(t); return { status: "PENDING" }; } } as never);
    return { svc, transitions };
  };

  it("is recorded against whoever asked: the platform team, or the restaurant's staff by default", async () => {
    const a = make("FAILED"); await a.svc.retry("r1", "o1", "admin-1", "PLATFORM_USER");
    assert.deepEqual([a.transitions[0].actor, a.transitions[0].actorId, a.transitions[0].reason], ["PLATFORM_USER", "admin-1", "Retry requested by the platform team"]);
    const b = make("FAILED"); await b.svc.retry("r1", "o1", "user-1");
    assert.deepEqual([b.transitions[0].actor, b.transitions[0].reason], ["RESTAURANT_USER", "Retry requested by staff"]);
  });

  it("only a FAILED order can be retried, and an order of another restaurant cannot be reached", async () => {
    for (const status of ["PENDING", "SENT", "CONFIRMED", "PAID", "CANCELLED"]) {
      const m = make(status);
      await assert.rejects(m.svc.retry("r1", "o1", "admin-1", "PLATFORM_USER"), /Only a FAILED order/, status);
      assert.equal(m.transitions.length, 0);
    }
    await assert.rejects(make("FAILED").svc.retry("r2", "o1", "admin-1", "PLATFORM_USER"), NotFoundException);
  });
});
