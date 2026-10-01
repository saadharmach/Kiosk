import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hydrateCatalog, type CatalogProduct, type RawCatalog } from "../src/lib/api";
import { MAX_OFFERED, pickSuggestions } from "../src/lib/suggestions";

const product = (id: string, over: Partial<CatalogProduct> = {}): CatalogProduct => ({
  id, categoryId: "1", name: `P${id}`, description: null, imagePath: null, imageUrl: null, badgeText: null,
  sortOrder: 0, visible: true, pricing: "BASE", price: 5, sizes: [], optionGroups: [], isMenu: false, promo: false, allergens: [], ...over,
});
const catalog = (suggestions: Record<string, string[]>, ...products: CatalogProduct[]) => ({ products, suggestions });
const ids = (l: CatalogProduct[]) => l.map((p) => p.id);

describe("which suggestions are offered", () => {
  const all = ["10", "11", "12", "13", "14", "15"].map((i) => product(i));

  it("a department's own list, in the order set", () => {
    assert.deepEqual(ids(pickSuggestions(catalog({ "1": ["12", "10"] }, ...all), "1", [])), ["12", "10"]);
  });

  it("each department has its own, and one with none offers nothing", () => {
    const c = catalog({ "1": ["10"], "2": ["11"] }, ...all);
    assert.deepEqual(ids(pickSuggestions(c, "1", [])), ["10"]);
    assert.deepEqual(ids(pickSuggestions(c, "2", [])), ["11"]);
    assert.deepEqual(pickSuggestions(c, "3", []), []);
    assert.deepEqual(pickSuggestions(c, null, []), []);
  });

  it("skips anything already in the order", () => {
    assert.deepEqual(ids(pickSuggestions(catalog({ "1": ["10", "11", "12"] }, ...all), "1", ["11"])), ["10", "12"]);
  });

  it("offers at most four, and the ones skipped make room for later ones", () => {
    const c = catalog({ "1": ["10", "11", "12", "13", "14", "15"] }, ...all);
    assert.equal(MAX_OFFERED, 4);
    assert.deepEqual(ids(pickSuggestions(c, "1", [])), ["10", "11", "12", "13"]);
    assert.deepEqual(ids(pickSuggestions(c, "1", ["10", "11"])), ["12", "13", "14", "15"]);
  });

  it("never offers what cannot be sold: unknown, hidden, menus, unpriced", () => {
    const c = catalog(
      { "1": ["99", "20", "21", "22", "10"] },
      product("10"), product("20", { visible: false }), product("21", { pricing: "MENU", price: null }), product("22", { pricing: "UNPRICED", price: null }),
    );
    assert.deepEqual(ids(pickSuggestions(c, "1", [])), ["10"]);
  });
});

describe("the catalog the kiosk receives", () => {
  it("keeps the suggestions through hydration", () => {
    const raw = { currency: "MAD", categories: [], products: [], groupDefs: {}, suggestions: { "1": ["10"] } } as unknown as RawCatalog;
    assert.deepEqual(hydrateCatalog(raw).suggestions, { "1": ["10"] });
  });
});
