import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { RESTAURANT_UNAVAILABLE, requireOrderable } from "../src/kiosk/availability.js";
import { CatalogService } from "../src/kiosk/catalog.service.js";
import { OrdersService } from "../src/kiosk/orders.service.js";

const body = (e: unknown) => (e as ServiceUnavailableException).getResponse() as Record<string, unknown>;

describe("is this restaurant taking orders", () => {
  it("an active restaurant passes", () => assert.doesNotThrow(() => requireOrderable({ status: "ACTIVE", name: "A" })));

  it("an address that matches nothing is a plain 404", () => {
    for (const none of [null, undefined]) assert.throws(() => requireOrderable(none), NotFoundException);
  });

  it("a suspended or archived restaurant is a 503 with the code the kiosk looks for, and its name", () => {
    for (const status of ["SUSPENDED", "ARCHIVED"]) {
      try { requireOrderable({ status, name: "Chez Sam" }); assert.fail("should have thrown"); } catch (e) {
        assert.ok(e instanceof ServiceUnavailableException, status);
        assert.equal(body(e).code, RESTAURANT_UNAVAILABLE);
        assert.equal(body(e).restaurantName, "Chez Sam");
      }
    }
  });

  it("never tells a customer why: no mention of the status", () => {
    for (const status of ["SUSPENDED", "ARCHIVED"]) {
      try { requireOrderable({ status, name: "Chez Sam" }); } catch (e) {
        const text = JSON.stringify(body(e)).toLowerCase();
        for (const word of ["suspend", "archiv", "payment", "billing", "subscription"]) assert.equal(text.includes(word), false, `${status} leaks "${word}"`);
      }
    }
  });
});

describe("every public kiosk route refuses a restaurant that is not active", () => {
  const rest = (status: string) => ({ id: "r1", name: "Chez Sam", slug: "sam", currency: "MAD", status, locale: "fr", settings: {}, tpapi: null });
  const prisma = (status: string) => ({
    subscriptionPeriod: { findFirst: async () => ({ id: "running" }) }, // a running subscription, unless a test says otherwise
    restaurant: { findUnique: async (a: { where: { slug: string } }) => (a.where.slug === "ghost" ? null : rest(status)) },
    order: { findFirst: async () => null },
  });
  const catalog = (status: string) => new CatalogService(prisma(status) as never, {} as never);
  const orders = (status: string) => new OrdersService(prisma(status) as never, {} as never, {} as never);
  const unavailable = (e: unknown) => e instanceof ServiceUnavailableException && body(e).code === RESTAURANT_UNAVAILABLE;
  const dto = { orderType: "EAT_IN", salesAreaId: "1", lines: [], clientOrderId: "11111111-1111-4111-8111-111111111111" } as never;

  for (const status of ["SUSPENDED", "ARCHIVED"]) {
    it(`${status}: the bootstrap, the menu, a price quote, an order and a ticket read-back all say unavailable`, async () => {
      await assert.rejects(catalog(status).bootstrap("sam"), unavailable);
      await assert.rejects(catalog(status).catalog("sam", "1"), unavailable);
      await assert.rejects(orders(status).preview("sam", dto), unavailable);
      await assert.rejects(orders(status).create("sam", dto), unavailable);
      await assert.rejects(orders(status).getByClientOrderId("sam", "11111111-1111-4111-8111-111111111111"), unavailable);
    });
  }

  it("an address that matches nothing stays a 404 on every route", async () => {
    const nf = (e: unknown) => e instanceof NotFoundException;
    await assert.rejects(catalog("ACTIVE").bootstrap("ghost"), nf);
    await assert.rejects(catalog("ACTIVE").catalog("ghost", "1"), nf);
    await assert.rejects(orders("ACTIVE").create("ghost", dto), nf);
  });
});
