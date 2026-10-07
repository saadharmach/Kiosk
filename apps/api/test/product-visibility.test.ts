import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CatalogAdminService } from "../src/restaurant/catalog-admin.service.js";

const R = "r1";
const art = (id: number, dept: number, name = `Art ${id}`, over: any = {}) => ({ restaurantId: R, untillId: BigInt(id), name, number: id, departmentId: BigInt(dept), isMenu: false, isActive: true, isPresent: true, ...over });

function setup(articles: any[], pres: any[] = []) {
  const rows = pres.map((p) => ({ restaurantId: R, ...p }));
  const calls: any[] = [];
  const match = (a: any, w: any) => a.restaurantId === w.restaurantId && a.isActive === w.isActive && a.isPresent === w.isPresent
    && (w.departmentId === undefined || a.departmentId === w.departmentId)
    && (!w.name || a.name.toLowerCase().includes(w.name.contains.toLowerCase()));
  const prisma: any = {
    tpapiArticle: { findMany: async (q: any) => { calls.push({ op: "articles", where: q.where }); return articles.filter((a) => match(a, q.where)); } },
    productPresentation: {
      findMany: async (q: any) => { calls.push({ op: "pres", where: q.where }); return rows.filter((r) => r.restaurantId === q.where.restaurantId); },
      createMany: (q: any) => ({ op: "create", q }),
      updateMany: (q: any) => ({ op: "update", q }),
    },
    productAllergen: { findMany: async () => [] },
    $transaction: async (ops: any[]) => {
      for (const o of ops) {
        calls.push({ op: o.op, q: o.q });
        if (o.op === "create") for (const d of o.q.data) if (!rows.some((r) => r.restaurantId === d.restaurantId && r.articleId === d.articleId)) rows.push({ ...d });
        if (o.op === "update") for (const r of rows) if (r.restaurantId === o.q.where.restaurantId && o.q.where.articleId.in.includes(r.articleId)) Object.assign(r, o.q.data);
      }
    },
  };
  const svc = new CatalogAdminService(prisma, { publicUrl: () => null } as never);
  const shown = async () => (await svc.listProducts(R, { pageSize: "200" })).products.filter((p) => p.isVisible).map((p) => p.posName).sort();
  return { svc, rows, calls, shown };
}

describe("products start hidden; Show all / Hide all", () => {
  it("a product never touched is listed as hidden", async () => {
    const { shown } = setup([art(1, 1), art(2, 1)], [{ articleId: 1n, isVisible: true }]);
    assert.deepEqual(await shown(), ["Art 1"]);
  });

  it("Show all shows every listed product, creating rows for the ones never touched", async () => {
    const { svc, shown } = setup([art(1, 1), art(2, 1), art(3, 2)], [{ articleId: 1n, isVisible: false }]);
    assert.deepEqual(await svc.setVisibility(R, { isVisible: true }), { changed: 3 });
    assert.deepEqual(await shown(), ["Art 1", "Art 2", "Art 3"]);
  });

  it("acts only on what the filters list: one category, or a search", async () => {
    const a = setup([art(1, 1, "Burger"), art(2, 1, "Cheeseburger"), art(3, 2, "Cola")]);
    await a.svc.setVisibility(R, { isVisible: true, categoryId: "1" });
    assert.deepEqual(await a.shown(), ["Burger", "Cheeseburger"]);
    await a.svc.setVisibility(R, { isVisible: false, search: "cheese" });
    assert.deepEqual(await a.shown(), ["Burger"]);
  });

  it("Hide all hides, and keeps the other things a product has (its name, photo...)", async () => {
    const { svc, rows } = setup([art(1, 1)], [{ articleId: 1n, isVisible: true, displayName: { fr: "Le burger" } }]);
    await svc.setVisibility(R, { isVisible: false });
    assert.deepEqual(rows[0], { restaurantId: R, articleId: 1n, isVisible: false, displayName: { fr: "Le burger" } });
  });

  it("the shown / hidden filter lists and acts on just those", async () => {
    const { svc } = setup([art(1, 1), art(2, 1), art(3, 1)], [{ articleId: 1n, isVisible: true }]);
    assert.deepEqual((await svc.listProducts(R, { visibility: "hidden" })).products.map((p) => p.posName), ["Art 2", "Art 3"]);
    assert.deepEqual(await svc.setVisibility(R, { isVisible: true, visibility: "hidden" }), { changed: 2 });
    await assert.rejects(svc.listProducts(R, { visibility: "maybe" }), /Unknown visibility/);
  });

  it("with the 'missing an image' filter, only the listed products change", async () => {
    const { svc, shown } = setup([art(1, 1), art(2, 1)], [{ articleId: 1n, isVisible: false, imagePath: "x.jpg" }, { articleId: 2n, isVisible: false, imagePath: null }]);
    assert.deepEqual(await svc.setVisibility(R, { isVisible: true, missing: "image" }), { changed: 1 });
    assert.deepEqual(await shown(), ["Art 2"]);
  });

  it("nothing matches: nothing is written", async () => {
    const { svc, calls } = setup([art(1, 1)]);
    assert.deepEqual(await svc.setVisibility(R, { isVisible: true, search: "nothing like this" }), { changed: 0 });
    assert.ok(!calls.some((c) => c.op === "create" || c.op === "update"));
  });

  it("every read and write is scoped to the restaurant; another restaurant's products are untouched", async () => {
    const { svc, calls, rows } = setup([art(1, 1), { ...art(2, 1), restaurantId: "r2" }], [{ restaurantId: "r2", articleId: 2n, isVisible: false }]);
    await svc.setVisibility(R, { isVisible: true });
    for (const c of calls) {
      const where = c.where ?? c.q?.where;
      if (where) assert.equal(where.restaurantId, R, c.op);
      if (c.op === "create") for (const d of c.q.data) assert.equal(d.restaurantId, R);
    }
    assert.equal(rows.find((r) => r.restaurantId === "r2")!.isVisible, false);
  });
});
