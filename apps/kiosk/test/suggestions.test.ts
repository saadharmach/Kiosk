import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hydrateCatalog, type CatalogProduct, type RawCatalog } from "../src/lib/api";
import { MAX_IN_BASKET, MAX_OFFERED, needsChoices, pickBasketSuggestions, pickSuggestions } from "../src/lib/suggestions";

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

describe("what the basket offers", () => {
  const mains = ["10", "11", "12"].map((i) => product(i, { categoryId: "1" }));
  const drinks = ["20", "21", "22"].map((i) => product(i, { categoryId: "2" }));
  const desserts = ["30", "31"].map((i) => product(i, { categoryId: "3" }));
  const all = [...mains, ...drinks, ...desserts];
  const lists = { "1": ["30", "31", "11"], "2": ["31", "10", "22"] };

  it("the restaurant's own basket list comes first, in its order, whatever is in the basket", () => {
    const c = { ...catalog(lists, ...all), basketSuggestions: ["22", "30", "12"] };
    assert.deepEqual(ids(pickBasketSuggestions(c, ["10"])), ["22", "30", "12"]);
  });

  it("with no own list: the lists of the departments in the basket, one from each in turn, without repeats", () => {
    const c = { ...catalog(lists, ...all), basketSuggestions: [] };
    // Basket: a main (department 1), then a drink (department 2).
    assert.deepEqual(ids(pickBasketSuggestions(c, ["12", "20"])), ["30", "31", "10", "11", "22"]);
  });

  it("an older server that sends no basket list: the same fallback", () => {
    assert.deepEqual(ids(pickBasketSuggestions(catalog(lists, ...all), ["20"])), ["31", "10", "22"]);
  });

  it("leaves out what is already in the basket and what cannot be sold", () => {
    const hidden = product("40", { visible: false });
    const c = { ...catalog({}, ...all, hidden), basketSuggestions: ["10", "40", "99", "30"] };
    assert.deepEqual(ids(pickBasketSuggestions(c, ["10"])), ["30"]);
  });

  it(`offers at most ${MAX_IN_BASKET}`, () => {
    const many = Array.from({ length: 9 }, (_, i) => product(String(50 + i)));
    const c = { ...catalog({}, ...many), basketSuggestions: many.map((p) => p.id) };
    assert.equal(pickBasketSuggestions(c, []).length, MAX_IN_BASKET);
  });

  it("an empty basket offers nothing from the departments", () => {
    assert.deepEqual(pickBasketSuggestions(catalog(lists, ...all), []), []);
  });
});

describe("which suggestions open their own sheet", () => {
  const group = (kind: "MUST_HAVE" | "SUPPLEMENT" | "CONDIMENT" | "FREE_OPTION", requiredChoices: number | null = null) =>
    ({ id: kind, kind, requiredChoices, name: kind, items: [] });

  it("a size or a required choice: yes", () => {
    assert.equal(needsChoices(product("1", { sizes: [{ sizeItemId: "7", name: "L", price: 3 }] as never })), true);
    assert.equal(needsChoices(product("1", { optionGroups: [group("MUST_HAVE")] })), true);
    assert.equal(needsChoices(product("1", { optionGroups: [group("FREE_OPTION", 2)] })), true);
  });

  it("optional extras only, or nothing: no, it is added as it is", () => {
    assert.equal(needsChoices(product("1", { optionGroups: [group("SUPPLEMENT"), group("CONDIMENT"), group("FREE_OPTION")] })), false);
    assert.equal(needsChoices(product("1")), false);
  });
});
