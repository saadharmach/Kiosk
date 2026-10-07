import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CatalogAdminService } from "../src/restaurant/catalog-admin.service.js";

const R = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const photo = (name = "a.jpg", rid = R) => `restaurants/${rid}/categories/department-7/${name}`;

function setup(pres: Record<string, unknown> | null = null) {
  const calls: { op: string; args: any }[] = [];
  const removed: string[] = [];
  let row: Record<string, any> | null = pres ? { restaurantId: R, scope: "DEPARTMENT", untillId: 7n, ...pres } : null;
  const prisma: any = {
    tpapiDepartment: {
      findFirst: async (a: any) => { calls.push({ op: "dept.findFirst", args: a }); return a.where.restaurantId === R && a.where.untillId === 7n ? { id: "d" } : null; },
      findMany: async () => [{ untillId: 7n, name: "Burgers", number: 1 }],
    },
    tpapiGroup: { findFirst: async () => null, findMany: async () => [] },
    categoryPresentation: {
      findUnique: async (a: any) => { calls.push({ op: "pres.findUnique", args: a }); return row; },
      findMany: async () => (row ? [row] : []),
      upsert: async (a: any) => { calls.push({ op: "pres.upsert", args: a }); row = { ...(row ?? a.create), ...a.update }; return row; },
      update: async (a: any) => { calls.push({ op: "pres.update", args: a }); row = { ...row!, ...a.data }; return row; },
    },
  };
  const storage = {
    publicUrl: (p: string | null) => (p ? `https://cdn.test/${p}` : null),
    signUpload: async (a: any) => ({ ...a, uploadUrl: "u", path: "p" }),
    remove: async (p: string) => { removed.push(p); },
  };
  return { svc: new CatalogAdminService(prisma, storage as never), calls, removed, row: () => row };
}

describe("category photos", () => {
  it("signs an upload into this restaurant's categories folder, for a department that exists in this restaurant", async () => {
    const { svc, calls } = setup();
    const signed: any = await svc.signCategoryImage(R, "DEPARTMENT", "7", "image/png");
    assert.deepEqual([signed.restaurantId, signed.kind, signed.ownerId], [R, "categories", "department-7"]);
    assert.equal(calls[0]!.args.where.restaurantId, R);
  });
  it("another restaurant's department (or an unknown one) is a 404", async () => {
    await assert.rejects(setup().svc.signCategoryImage(OTHER, "DEPARTMENT", "7", "image/png"), /No such department/);
    await assert.rejects(setup().svc.signCategoryImage(R, "DEPARTMENT", "8", "image/png"), /No such department/);
  });
  it("saves a photo from this restaurant's category upload", async () => {
    const { svc, row } = setup();
    await svc.upsertCategory(R, "DEPARTMENT", "7", { imagePath: photo() });
    assert.equal(row()!.imagePath, photo());
  });
  it("refuses another restaurant's file, a product photo, or a path that climbs out", async () => {
    for (const bad of [photo("a.jpg", OTHER), `restaurants/${R}/products/5/a.jpg`, `restaurants/${R}/categories/../products/5/a.jpg`]) {
      await assert.rejects(setup().svc.upsertCategory(R, "DEPARTMENT", "7", { imagePath: bad }), /signed category upload/, bad);
    }
  });
  it("replacing a photo deletes the old file; saving the same one, or other fields, deletes nothing", async () => {
    const a = setup({ imagePath: photo("old.jpg") });
    await a.svc.upsertCategory(R, "DEPARTMENT", "7", { imagePath: photo("new.jpg") });
    assert.deepEqual(a.removed, [photo("old.jpg")]);
    const b = setup({ imagePath: photo("same.jpg") });
    await b.svc.upsertCategory(R, "DEPARTMENT", "7", { imagePath: photo("same.jpg") });
    await b.svc.upsertCategory(R, "DEPARTMENT", "7", { isVisible: false });
    assert.deepEqual(b.removed, []);
  });
  it("removing a photo clears the record first, then deletes the file, scoped to the restaurant", async () => {
    const { svc, calls, removed, row } = setup({ imagePath: photo("old.jpg") });
    await svc.clearCategoryImage(R, "DEPARTMENT", "7");
    assert.equal(row()!.imagePath, null);
    assert.deepEqual(removed, [photo("old.jpg")]);
    const upd = calls.find((c) => c.op === "pres.update")!;
    assert.equal(upd.args.where.restaurantId_scope_untillId.restaurantId, R);
  });
  it("the back office list carries the photo's address", async () => {
    const { svc } = setup({ imagePath: photo() });
    const list = await svc.listCategories(R);
    assert.equal(list.departments[0]!.imageUrl, `https://cdn.test/${photo()}`);
  });
});
