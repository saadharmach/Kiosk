import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CatalogService } from "../src/kiosk/catalog.service.js";

const R = "r1";
const D = (n: number) => ({ toString: () => String(n), valueOf: () => n }) as unknown as number;
function setup(o: { articles?: any[]; prices?: any[]; sizes?: any[]; pres?: any[]; untouched?: bigint[] } = {}) {
  // As the restaurant has it: a product with no row of its own has been shown, except the `untouched` ones (hidden).
  const pres = [...(o.pres ?? [])];
  for (const a of o.articles ?? []) {
    if (!pres.some((p) => p.articleId === a.untillId && p.restaurantId === a.restaurantId) && !(o.untouched ?? []).includes(a.untillId)) {
      pres.push({ restaurantId: a.restaurantId, articleId: a.untillId, isVisible: true, displayName: null });
    }
  }
  const calls: any[] = [];
  const pick = (rows: any[], model: string) => async (a: any) => {
    calls.push({ model, where: a.where });
    return rows.filter((r) => r.restaurantId === a.where.restaurantId
      && (!a.where.untillId || a.where.untillId.in.includes(r.untillId))
      && (!a.where.articleId || a.where.articleId.in.includes(r.articleId))
      && (a.where.priceLevelId === undefined || r.priceLevelId === a.where.priceLevelId)
      && (!a.where.availableSalesAreaIds || r.availableSalesAreaIds.includes(a.where.availableSalesAreaIds.has))
      && (a.where.isActive === undefined || r.isActive === a.where.isActive)
      && (a.where.isMenu === undefined || r.isMenu === a.where.isMenu));
  };
  const prisma: any = {
    tpapiArticle: { findMany: pick(o.articles ?? [], "article") },
    tpapiArticlePrice: { findMany: pick(o.prices ?? [], "price") },
    tpapiArticleSizePrice: { findMany: pick(o.sizes ?? [], "size") },
    productPresentation: { findMany: pick(pres, "pres") },
  };
  const storage = { publicUrl: (p: string | null) => (p ? `/media/${p}` : null) };
  const svc = new CatalogService(prisma, storage as never) as any;
  return { slides: (raw: unknown, orderTypes: { configured: boolean; salesAreaId: string | null }[] = [{ configured: true, salesAreaId: "100" }]) =>
    svc.welcomeSlides(R, raw, orderTypes, [{ untillId: 100n, priceLevelId: 5n }, { untillId: 200n, priceLevelId: 6n }]), calls };
}
const art = (id: number, over: any = {}) => ({ restaurantId: R, untillId: BigInt(id), name: `Art ${id}`, isActive: true, isPresent: true, isMenu: false, sizeModifierId: null, availableSalesAreaIds: [100n], ...over });
const price = (id: number, amount: number, level = 5n) => ({ restaurantId: R, articleId: BigInt(id), priceLevelId: level, amount: D(amount) });

describe("welcome slides on the kiosk", () => {
  it("photos and videos, in order; a slide without a product has no card", async () => {
    const out = await setup().slides([{ path: "a.jpg", productId: null }, { path: "b.mp4", productId: null }]);
    assert.deepEqual(out, [{ url: "/media/a.jpg", kind: "image", product: null }, { url: "/media/b.mp4", kind: "video", product: null }]);
  });
  it("a linked product shows its menu name and its price at the first order type's sales area", async () => {
    const { slides } = setup({
      articles: [art(1)], prices: [price(1, 16.9), price(1, 99, 6n)],
      pres: [{ restaurantId: R, articleId: 1n, isVisible: true, displayName: { fr: "Le menu Signature", en: "The Signature" } }],
    });
    const [s] = await slides([{ path: "a.jpg", productId: "1" }]);
    assert.deepEqual(s.product, { id: "1", name: "Art 1", names: { fr: "Le menu Signature", en: "The Signature" }, price: 16.9, fromPrice: false });
  });
  it("a product with sizes is shown from its cheapest size", async () => {
    const { slides } = setup({ articles: [art(2, { sizeModifierId: 9n })], prices: [price(2, 0)],
      sizes: [{ restaurantId: R, articleId: 2n, priceLevelId: 5n, amount: D(12) }, { restaurantId: R, articleId: 2n, priceLevelId: 5n, amount: D(9.5) }] });
    const [s] = await slides([{ path: "a.jpg", productId: "2" }]);
    assert.deepEqual([s.product.price, s.product.fromPrice], [9.5, true]);
  });
  it("no card for a product that is not on sale there: switched off, hidden, a set menu, no price, other area, other restaurant", async () => {
    const { slides } = setup({
      articles: [art(3, { isActive: false }), art(4), art(5, { isMenu: true }), art(6), art(7, { availableSalesAreaIds: [200n] }), art(8, { restaurantId: "other" })],
      prices: [price(3, 5), price(4, 5), price(5, 5), price(6, 0), price(7, 5)],
      pres: [{ restaurantId: R, articleId: 4n, isVisible: false, displayName: null }],
    });
    const out = await slides(["3", "4", "5", "6", "7", "8"].map((id) => ({ path: `${id}.jpg`, productId: id })));
    assert.equal(out.length, 6, "the adverts stay");
    assert.deepEqual(out.map((x: any) => x.product), [null, null, null, null, null, null]);
  });
  it("no card for a product never shown (products from unTill start hidden)", async () => {
    const { slides } = setup({ articles: [art(9)], prices: [price(9, 5)], untouched: [9n] });
    assert.equal((await slides([{ path: "a.jpg", productId: "9" }]))[0].product, null);
  });
  it("with no order type ready, slides still show, without cards and without asking the database", async () => {
    const { slides, calls } = setup({ articles: [art(1)], prices: [price(1, 5)] });
    const out = await slides([{ path: "a.jpg", productId: "1" }], [{ configured: false, salesAreaId: null }]);
    assert.equal(out[0].product, null);
    assert.equal(calls.length, 0);
  });
  it("every query is scoped to the restaurant", async () => {
    const { slides, calls } = setup({ articles: [art(1)], prices: [price(1, 5)] });
    await slides([{ path: "a.jpg", productId: "1" }]);
    assert.ok(calls.length >= 4);
    for (const c of calls) assert.equal(c.where.restaurantId, R, c.model);
  });
});
