import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { lastValueFrom, of, throwError } from "rxjs";
import { ContentChangedInterceptor, changedRestaurant } from "../src/common/content-changed.interceptor.js";
import { CatalogService } from "../src/kiosk/catalog.service.js";

const RID = "11111111-1111-4111-8111-111111111111";
const backOffice = { type: "restaurant", rid: RID, slug: "resto-a" };
const admin = { type: "platform", sub: "u1", role: "SUPER_ADMIN" };
const req = (method: string, url: string, user?: unknown) => ({ method, originalUrl: url, path: url.split("?")[0]!, user });

describe("which restaurant a change was about", () => {
  it("a change in the back office: its own restaurant, from the sign-in", () => {
    for (const m of ["POST", "PUT", "PATCH", "DELETE"]) assert.equal(changedRestaurant(req(m, "/api/restaurant/resto-a/catalog/products/7", backOffice)), RID, m);
  });
  it("a change made in the admin for a restaurant: that restaurant", () => {
    assert.equal(changedRestaurant(req("PATCH", `/api/admin/restaurants/${RID}`, admin)), RID);
    assert.equal(changedRestaurant(req("POST", `/api/admin/restaurants/${RID}/tpapi/sync?x=1`, admin)), RID);
  });
  it("reading is not a change; nor are the kiosk's own requests, sign-ins, or admin pages about no one restaurant", () => {
    assert.equal(changedRestaurant(req("GET", "/api/restaurant/resto-a/catalog/products", backOffice)), null);
    assert.equal(changedRestaurant(req("POST", "/api/kiosk/resto-a/orders")), null);
    assert.equal(changedRestaurant(req("POST", "/api/restaurant/auth/login")), null);
    assert.equal(changedRestaurant(req("POST", "/api/admin/team", admin)), null);
    assert.equal(changedRestaurant(req("POST", "/api/admin/restaurants", admin)), null, "a new restaurant has no kiosk yet");
  });
  it("an admin address without an admin sign-in, or a back-office address without its sign-in: nothing", () => {
    assert.equal(changedRestaurant(req("PATCH", `/api/admin/restaurants/${RID}`, backOffice)), null);
    assert.equal(changedRestaurant(req("PATCH", "/api/restaurant/resto-a/settings", admin)), null);
  });
});

describe("marking it changed", () => {
  function setup() {
    const writes: any[] = [];
    const prisma = { restaurant: { updateMany: async (a: any) => { writes.push(a); return { count: 1 }; } } };
    const interceptor = new ContentChangedInterceptor(prisma as never);
    const ctx = (r: unknown) => ({ switchToHttp: () => ({ getRequest: () => r }) }) as never;
    return { writes, run: (r: unknown, result: any) => lastValueFrom(interceptor.intercept(ctx(r), { handle: () => result })) };
  }
  it("after a change that worked: the restaurant's kiosks are told, scoped by its id", async () => {
    const { writes, run } = setup();
    assert.deepEqual(await run(req("PATCH", "/api/restaurant/resto-a/settings", backOffice), of({ ok: 1 })), { ok: 1 }, "the answer is untouched");
    await new Promise((r) => setImmediate(r));
    assert.equal(writes.length, 1);
    assert.deepEqual(writes[0].where, { id: RID });
    assert.ok(writes[0].data.contentChangedAt instanceof Date);
  });
  it("a change that failed, or a read: nothing is marked", async () => {
    const { writes, run } = setup();
    await assert.rejects(run(req("PATCH", "/api/restaurant/resto-a/settings", backOffice), throwError(() => new Error("400"))));
    await run(req("GET", "/api/restaurant/resto-a/settings", backOffice), of({}));
    await new Promise((r) => setImmediate(r));
    assert.equal(writes.length, 0);
  });
});

describe("what the kiosk asks every 20 seconds", () => {
  const svc = (row: unknown, subscribed = true) => new CatalogService({ restaurant: { findUnique: async () => row }, subscriptionPeriod: { findFirst: async () => (subscribed ? { id: "s" } : null) } } as never, {} as never);
  it("answers with when the restaurant last changed — also when it is switched off", async () => {
    assert.deepEqual(await svc({ id: "r1", timezone: "UTC", contentChangedAt: new Date("2026-10-07T10:00:00Z") }).version("resto-a"), { version: "2026-10-07T10:00:00.000Z" });
  });
  it("it also changes when a subscription period starts or ends (at midnight nobody saves anything)", async () => {
    const row = { id: "r1", timezone: "UTC", contentChangedAt: new Date("2026-10-07T10:00:00Z") };
    assert.notEqual((await svc(row, false).version("resto-a")).version, (await svc(row, true).version("resto-a")).version);
  });
  it("an unknown restaurant is a 404", async () => {
    await assert.rejects(svc(null).version("nope"), /not found/i);
  });
});
