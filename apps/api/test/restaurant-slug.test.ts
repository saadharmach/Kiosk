import assert from "node:assert/strict";
import { describe, it } from "node:test";
import "reflect-metadata";
import { ConflictException } from "@nestjs/common";
import { RestaurantsService } from "../src/admin/restaurants.service.js";

function setup(opts: { orders: number; taken?: string }) {
  const writes: any[] = [];
  const audits: any[] = [];
  const row = { id: "r1", slug: "old-slug", name: "Chez Sam", status: "ACTIVE", city: null, country: null, currency: "MAD", timezone: "UTC", createdAt: new Date() };
  const prisma = {
    restaurant: {
      findUnique: async (a: any) => (a.where.id === "r1" ? row : a.where.slug && a.where.slug === opts.taken ? { id: "other" } : null),
      update: async (a: any) => { writes.push(a); return { ...row, ...a.data }; },
    },
    order: { count: async (a: any) => { assert.equal(a.where.restaurantId, "r1"); return opts.orders; } },
  };
  const svc = new RestaurantsService(prisma as never, { record: async (e: unknown) => { audits.push(e); } } as never, { assertReal: async () => undefined } as never);
  return { svc, writes, audits };
}
const actor = { id: "admin-1" };

describe("a restaurant's address (slug) is editable until its first order", () => {
  it("can be changed while there are no orders, and the change is audited as such", async () => {
    const { svc, writes, audits } = setup({ orders: 0 });
    await svc.update("r1", { slug: "new-slug" }, actor, {} as never);
    assert.equal(writes[0].data.slug, "new-slug");
    assert.equal(audits[0].action, "restaurant.slug.change");
    assert.equal(audits[0].before.slug, "old-slug");
    assert.equal(audits[0].after.slug, "new-slug");
  });

  it("is frozen once the restaurant has taken an order: refused, nothing written", async () => {
    const { svc, writes } = setup({ orders: 1 });
    await assert.rejects(svc.update("r1", { slug: "new-slug" }, actor, {} as never), (e) => e instanceof ConflictException && /taken orders/.test((e as Error).message));
    assert.equal(writes.length, 0);
  });

  it("cannot take an address that another restaurant already has", async () => {
    const { svc, writes } = setup({ orders: 0, taken: "taken" });
    await assert.rejects(svc.update("r1", { slug: "taken" }, actor, {} as never), ConflictException);
    assert.equal(writes.length, 0);
  });

  it("sending the address it already has is harmless, even after orders (the form always sends it)", async () => {
    const { svc, writes, audits } = setup({ orders: 40 });
    await svc.update("r1", { slug: "old-slug", name: "Chez Sam 2" }, actor, {} as never);
    assert.equal(writes.length, 1);
    assert.equal(audits[0].action, "restaurant.update");
  });

  it("other edits never look at orders at all", async () => {
    const { svc, writes } = setup({ orders: 99 });
    await svc.update("r1", { name: "New name" }, actor, {} as never);
    assert.equal(writes.length, 1);
  });
});
