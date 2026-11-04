import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CatalogAdminService } from "../src/restaurant/catalog-admin.service.js";

const R = "11111111-1111-4111-8111-111111111111";

/** Three departments in unTill's order (number), and whatever presentation rows the test starts with. */
function setup(start: { untillId: bigint; sortOrder: number; displayName?: unknown }[] = []) {
  const depts = [
    { untillId: 10n, name: "Burgers", number: 1, groupId: null },
    { untillId: 20n, name: "Drinks", number: 2, groupId: null },
    { untillId: 30n, name: "Desserts", number: 3, groupId: null },
  ];
  const rows = new Map(start.map((r) => [r.untillId.toString(), { restaurantId: R, scope: "DEPARTMENT", displayName: null, ...r }]));
  const writes: any[] = [];
  const prisma: any = {
    tpapiDepartment: {
      findMany: async (a: any) => { assert.equal(a.where.restaurantId, R); return depts; },
      findFirst: async (a: any) => depts.find((d) => a.where.restaurantId === R && d.untillId === a.where.untillId) ?? null,
    },
    tpapiGroup: { findMany: async () => [], findFirst: async () => null },
    categoryPresentation: {
      findMany: async () => [...rows.values()],
      findUnique: async (a: any) => rows.get(a.where.restaurantId_scope_untillId.untillId.toString()) ?? null,
      upsert: (a: any) => {
        writes.push(a);
        assert.equal(a.where.restaurantId_scope_untillId.restaurantId, R, "scoped to the restaurant");
        const k = a.where.restaurantId_scope_untillId.untillId.toString();
        const r = rows.get(k);
        // Like the real table: a new row's position defaults to 0 when none is given.
        rows.set(k, r ? { ...r, ...a.update } : { sortOrder: 0, ...a.create });
        return Promise.resolve(rows.get(k));
      },
    },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  };
  const svc = new CatalogAdminService(prisma, { publicUrl: () => null, remove: async () => {} } as never);
  const order = async () => (await svc.listCategories(R)).departments.map((d) => d.posName);
  return { svc, order, writes };
}

describe("the order of the categories on the kiosk", () => {
  it("starts in unTill's order", async () => {
    assert.deepEqual(await setup().order(), ["Burgers", "Drinks", "Desserts"]);
  });

  it("is saved all at once, and the back office lists them in that order", async () => {
    const { svc, order } = setup();
    const r = await svc.setDepartmentOrder(R, ["30", "10", "20"]);
    assert.deepEqual(r.departments.map((d) => d.posName), ["Desserts", "Burgers", "Drinks"]);
    assert.deepEqual(await order(), ["Desserts", "Burgers", "Drinks"]);
  });

  it("a department the list left out keeps its turn after the others; a repeated one counts once", async () => {
    const { svc, order } = setup();
    await svc.setDepartmentOrder(R, ["20", "20"]);
    assert.deepEqual(await order(), ["Drinks", "Burgers", "Desserts"]);
  });

  it("refuses an id that is not one of this restaurant's departments, writing nothing", async () => {
    const { svc, writes } = setup();
    await assert.rejects(svc.setDepartmentOrder(R, ["10", "999"]), /Not departments of this restaurant: 999/);
    assert.equal(writes.length, 0);
  });

  it("renaming a department for the first time does not move it to the top (it used to)", async () => {
    const { svc, order } = setup();
    await svc.upsertCategory(R, "DEPARTMENT", "30", { displayName: { fr: "Desserts maison" } });
    assert.deepEqual(await order(), ["Burgers", "Drinks", "Desserts"]);
  });

  it("an order already set is kept when a department is renamed", async () => {
    const { svc, order } = setup();
    await svc.setDepartmentOrder(R, ["30", "10", "20"]);
    await svc.upsertCategory(R, "DEPARTMENT", "20", { displayName: { fr: "Boissons" } });
    assert.deepEqual(await order(), ["Desserts", "Burgers", "Drinks"]);
  });
});
