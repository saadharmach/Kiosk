import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CatalogService } from "../src/kiosk/catalog.service.js";
import { D, model, type Call } from "./helpers/fake-prisma.js";

const AREA = 100n;
const art = (id: bigint, name: string, over: Record<string, unknown> = {}) => ({
  untillId: id, name, number: Number(id), isActive: true, isPresent: true, isMenu: false, isPromo: false, promo: false,
  sizeModifierId: null, departmentId: 1n, availableSalesAreaIds: [AREA], ...over,
});

function world(over: Record<string, unknown[]> = {}) {
  return {
    tpapiGroup: [{ untillId: 9n, name: "Food" }],
    tpapiDepartment: [
      { untillId: 1n, name: "Mains", number: 1, groupId: 9n, availableSalesAreaIds: [AREA] },
      { untillId: 2n, name: "Desserts", number: 2, groupId: 9n, availableSalesAreaIds: [AREA] },
      { untillId: 3n, name: "Drinks", number: 3, groupId: 9n, availableSalesAreaIds: [AREA] },
    ],
    tpapiArticle: [
      art(10n, "Burger", { departmentId: 1n }),
      art(11n, "Cake", { departmentId: 2n }),
      art(12n, "Cola", { departmentId: 3n, sizeModifierId: 7n }),
      art(13n, "Staff meal", { departmentId: 1n }), // base price zero
      art(14n, "Custom drink", { departmentId: 3n }), // base price zero, sold through paid options
      art(15n, "Menu of the day", { departmentId: 1n, isMenu: true }),
      art(16n, "Nameless", { departmentId: null }),
      art(21n, "Mayo", { departmentId: null }),
      art(22n, "Lemon", { departmentId: null }),
    ],
    tpapiArticlePrice: [
      { articleId: 10n, amount: D(10), vat: D(10) },
      { articleId: 11n, amount: D(6), vat: D(10) },
      { articleId: 13n, amount: D(0), vat: D(10) },
      { articleId: 14n, amount: D(0), vat: D(10) },
      { articleId: 16n, amount: D(3), vat: D(10) },
    ],
    tpapiArticleSizePrice: [{ articleId: 12n, sizeItemId: 71n, amount: D(3) }, { articleId: 12n, sizeItemId: 72n, amount: D(5) }],
    tpapiSizeModifierItem: [{ untillId: 71n, name: "Small", isActive: true }, { untillId: 72n, name: "Large", isActive: true }],
    tpapiArticleOption: [{ articleId: 14n, optionGroupId: 50n, requiredChoices: null, isFreeOption: false }],
    tpapiOptionGroup: [{ untillId: 50n, name: "Flavour", availableSalesAreaIds: [AREA] }],
    tpapiOptionItem: [
      { optionGroupId: 50n, articleId: 21n, amount: D(2), vat: D(10) },
      { optionGroupId: 50n, articleId: 22n, amount: D(0), vat: null },
    ],
    productPresentation: [
      { articleId: 10n, displayName: { fr: "Burger FR", en: "Burger EN" }, description: null, imagePath: "restaurants/r1/products/10/a.png", badgeText: "New", isFeatured: true, sortOrder: 5, isVisible: true },
    ],
    categoryPresentation: [],
    productAllergen: [{ articleId: 10n, allergenId: 901n }],
    tpapiAllergen: [{ untillId: 901n, number: 1, name: "Gluten" }, { untillId: 902n, number: 2, name: "Nuts" }],
    ...over,
  };
}

function setup(over: Record<string, unknown[]> = {}, settings: Record<string, unknown> = { showAllergens: true }, restaurantOver: Record<string, unknown> = {}) {
  const calls: Call[] = [];
  const w = world(over);
  const rest = {
    id: "r1", slug: "resto-a", name: "Resto A", currency: "MAD", status: "ACTIVE", locale: "fr",
    logoPath: null, heroImagePath: null, tagline: null, primaryColor: null,
    settings, tpapi: { isEnabled: true, lastSuccessAt: null, lastSyncAt: new Date() }, ...restaurantOver,
  };
  const prisma: Record<string, unknown> = {
    restaurant: { findUnique: async () => rest },
    tpapiSalesArea: {
      findFirst: async () => ({ untillId: AREA, name: "Restaurant", priceLevelId: 10n }),
      findMany: async () => [{ untillId: AREA, name: "Restaurant", priceLevelId: 10n, tableRanges: [{ FromTable: 1, ToTable: 12 }] }],
    },
    orderTypeMapping: { findMany: async () => [] },
  };
  for (const [k, rows] of Object.entries(w)) prisma[k] = model(rows as never, calls, k);
  const storage = { publicUrl: (p: string | null) => (p ? `https://cdn.test/${p}` : null) };
  return { svc: new CatalogService(prisma as never, storage as never), calls, prisma };
}

const catalog = async (over: Record<string, unknown[]> = {}, settings?: Record<string, unknown>, locale?: string) => {
  const { svc, calls } = setup(over, settings);
  return { c: await svc.catalog("resto-a", "100", locale), calls };
};
const names = (c: { products: { name: string }[] }) => c.products.map((p) => p.name).sort();

describe("CatalogService.catalog: what the kiosk can sell", () => {
  it("returns priced products with their department", async () => {
    const { c } = await catalog();
    const burger = c.products.find((p) => p.name === "Burger FR")!;
    assert.equal(burger.price, 10);
    assert.equal(burger.pricing, "BASE");
    assert.equal(burger.categoryId, "1");
  });

  it("hides a product with a zero base price, because checkout would refuse it", async () => {
    const { c } = await catalog();
    assert.ok(!names(c).includes("Staff meal"));
  });

  it("keeps a zero-price product when a paid option makes it cost something", async () => {
    const { c } = await catalog();
    const custom = c.products.find((p) => p.name === "Custom drink");
    assert.ok(custom, "sold through its paid options");
    assert.equal(custom.pricing, "BASE");
  });

  it("hides a zero-price product whose options are all free", async () => {
    const { c } = await catalog({ tpapiOptionItem: [{ optionGroupId: 50n, articleId: 21n, amount: D(0), vat: null }] });
    assert.ok(!names(c).includes("Custom drink"));
  });

  it("marks sized products as SIZE, with the sizes sorted by price", async () => {
    const { c } = await catalog();
    const cola = c.products.find((p) => p.name === "Cola")!;
    assert.equal(cola.pricing, "SIZE");
    assert.deepEqual(cola.sizes.map((s) => s.name), ["Small", "Large"]);
  });

  it("marks a menu without a price as MENU (the kiosk does not show it yet)", async () => {
    const { c } = await catalog();
    assert.equal(c.products.find((p) => p.name === "Menu of the day")!.pricing, "MENU");
  });

  it("never sends a product with no department", async () => {
    const { c } = await catalog();
    assert.ok(!names(c).includes("Nameless"));
  });

  it("leaves out inactive products", async () => {
    const { c } = await catalog({ tpapiArticle: [art(10n, "Burger"), art(11n, "Gone", { isActive: false })] });
    assert.ok(!names(c).includes("Gone"));
  });
});

describe("CatalogService.catalog: what the restaurant chose to show", () => {
  it("hides a product the manager switched off", async () => {
    const { c } = await catalog({ productPresentation: [{ articleId: 10n, displayName: null, isVisible: false }] });
    assert.ok(!names(c).includes("Burger"));
  });

  it("hides a department the manager switched off, and takes its products with it", async () => {
    const { c } = await catalog({ categoryPresentation: [{ scope: "DEPARTMENT", untillId: 2n, isVisible: false }] });
    assert.ok(!c.categories.some((x) => x.name === "Desserts"));
    assert.ok(!names(c).includes("Cake"), "no product is sent that nobody can reach");
    assert.equal(c.counts.products, c.products.length);
    assert.equal(c.counts.categories, c.categories.length);
  });

  it("ignores group settings: only departments decide what is shown", async () => {
    const { c } = await catalog({ categoryPresentation: [{ scope: "GROUP", untillId: 9n, isVisible: false }] });
    assert.ok(c.categories.length >= 2, "a hidden group does not hide its departments");
  });

  it("does not send a department that has no products", async () => {
    const { c } = await catalog({ tpapiArticle: [art(10n, "Burger", { departmentId: 1n })] });
    assert.deepEqual(c.categories.map((x) => x.name), ["Mains"]);
  });

  it("uses the manager's names and the requested language, falling back to the unTill name", async () => {
    const fr = (await catalog({}, undefined, "fr")).c;
    const en = (await catalog({}, undefined, "en")).c;
    assert.equal(fr.products.find((p) => p.id === "10")!.name, "Burger FR");
    assert.equal(en.products.find((p) => p.id === "10")!.name, "Burger EN");
    assert.equal(en.products.find((p) => p.id === "11")!.name, "Cake"); // no presentation
  });

  it("builds image URLs, and sends none when there is no image", async () => {
    const { c } = await catalog();
    assert.equal(c.products.find((p) => p.id === "10")!.imageUrl, "https://cdn.test/restaurants/r1/products/10/a.png");
    assert.equal(c.products.find((p) => p.id === "11")!.imageUrl, null);
  });
});

describe("CatalogService.catalog: allergens", () => {
  it("sends each product's allergens when the restaurant shows them", async () => {
    const { c } = await catalog();
    assert.deepEqual(c.products.find((p) => p.id === "10")!.allergens, [{ id: "901", number: 1, name: "Gluten" }]);
    assert.deepEqual(c.products.find((p) => p.id === "11")!.allergens, []);
  });

  it("sends nothing, and does not even look them up, when the switch is off", async () => {
    const { c, calls } = await catalog({}, { showAllergens: false });
    for (const p of c.products) assert.deepEqual(p.allergens, []);
    assert.equal(calls.filter((x) => x.model === "productAllergen" || x.model === "tpapiAllergen").length, 0);
  });

  it("still shows an allergen unTill has since deactivated, because a customer must know", async () => {
    const { c } = await catalog({ tpapiAllergen: [{ untillId: 901n, number: 1, name: "Gluten", isActive: false }] });
    assert.equal(c.products.find((p) => p.id === "10")!.allergens.length, 1);
  });
});

describe("CatalogService.catalog: input checks", () => {
  it("rejects a sales area id that is not a number, before it reaches the database", async () => {
    const { svc } = setup();
    for (const bad of ["x", "1 or 1=1", "1.5", "-1", "１２３"]) {
      await assert.rejects(svc.catalog("resto-a", bad), (e: { getStatus?: () => number }) => e.getStatus?.() === 400, bad);
    }
  });

  it("answers 404 for a restaurant that is not active", async () => {
    const { svc } = setup({}, { showAllergens: true }, { status: "SUSPENDED" });
    await assert.rejects(svc.catalog("resto-a", "100"), (e: { getStatus?: () => number }) => e.getStatus?.() === 404);
    await assert.rejects(svc.bootstrap("resto-a"), (e: { getStatus?: () => number }) => e.getStatus?.() === 404);
  });
});

describe("CatalogService.bootstrap: order types", () => {
  const types = async (opts: { settings?: Record<string, unknown>; mappings?: Record<string, unknown>[]; ranges?: unknown }) => {
    const { svc, prisma } = setup({}, opts.settings ?? { eatInEnabled: true, takeAwayEnabled: true, askTableForEatIn: false });
    (prisma.orderTypeMapping as { findMany: unknown }).findMany = async () => opts.mappings ?? [];
    (prisma.tpapiSalesArea as { findMany: unknown }).findMany = async () => [
      { untillId: AREA, name: "Restaurant", priceLevelId: 10n, tableRanges: opts.ranges ?? [{ FromTable: 1, ToTable: 12 }] },
    ];
    const b = await svc.bootstrap("resto-a");
    return Object.fromEntries(b.orderTypes.map((o) => [o.orderType, o]));
  };
  const map = (orderType: string, over: Record<string, unknown> = {}) => ({
    orderType, salesAreaId: AREA, isEnabled: true, fixedTableNumber: null, tableRangeFrom: null, tableRangeTo: null, ...over,
  });

  it("offers an order type that has a fixed table", async () => {
    const t = await types({ mappings: [map("TAKE_AWAY", { fixedTableNumber: 3001 })] });
    assert.equal(t.TAKE_AWAY!.configured, true);
  });

  it("offers an order type that allocates stand numbers from a range", async () => {
    const t = await types({ mappings: [map("EAT_IN", { tableRangeFrom: 701, tableRangeTo: 763 })] });
    assert.equal(t.EAT_IN!.configured, true);
  });

  it("does not offer an order type that has no way to get a table", async () => {
    const t = await types({ mappings: [map("TAKE_AWAY")] });
    assert.equal(t.TAKE_AWAY!.configured, false);
  });

  it("does not offer an order type with no mapping at all", async () => {
    const t = await types({ mappings: [] });
    assert.equal(t.TAKE_AWAY!.configured, false);
    assert.equal(t.EAT_IN!.configured, false);
  });

  it("when eat-in asks for a table, it needs the sales area to define table ranges", async () => {
    const asks = { eatInEnabled: true, askTableForEatIn: true };
    assert.equal((await types({ settings: asks, mappings: [map("EAT_IN")] })).EAT_IN!.configured, true);
    assert.equal((await types({ settings: asks, mappings: [map("EAT_IN")], ranges: [] })).EAT_IN!.configured, false);
    assert.equal((await types({ settings: asks, mappings: [map("EAT_IN")], ranges: [{ junk: 1 }] })).EAT_IN!.configured, false);
  });

  it("accepts either casing of the table ranges", async () => {
    const asks = { eatInEnabled: true, askTableForEatIn: true };
    assert.equal((await types({ settings: asks, mappings: [map("EAT_IN")], ranges: [{ fromTable: 1, toTable: 5 }] })).EAT_IN!.configured, true);
  });

  it("does not list an order type the restaurant switched off", async () => {
    const t = await types({ settings: { eatInEnabled: true, takeAwayEnabled: false }, mappings: [map("EAT_IN", { fixedTableNumber: 1 })] });
    assert.ok(!("TAKE_AWAY" in t));
    assert.ok(!("DELIVERY" in t));
  });
});

describe("CatalogService.bootstrap: the restaurant's look", () => {
  it("sends the logo and hero as public URLs and only the languages that have a tagline", async () => {
    const { svc } = setup({}, { showAllergens: true }, {
      logoPath: "restaurants/r1/branding/logo/a.png", heroImagePath: "restaurants/r1/branding/hero/b.jpg",
      tagline: { fr: "Cuisine fraîche", en: "", ar: 7 }, primaryColor: "#0E6B54",
    });
    const b = await svc.bootstrap("resto-a");
    assert.equal(b.restaurant.logoUrl, "https://cdn.test/restaurants/r1/branding/logo/a.png");
    assert.equal(b.restaurant.heroImageUrl, "https://cdn.test/restaurants/r1/branding/hero/b.jpg");
    assert.deepEqual(b.restaurant.tagline, { fr: "Cuisine fraîche" });
    assert.equal(b.restaurant.primaryColor, "#0E6B54");
  });

  it("sends nulls and an empty tagline when nothing is set", async () => {
    const b = await setup().svc.bootstrap("resto-a");
    assert.equal(b.restaurant.logoUrl, null);
    assert.equal(b.restaurant.heroImageUrl, null);
    assert.deepEqual(b.restaurant.tagline, {});
  });

  it("says the catalog is not ready before the first sync", async () => {
    const { svc } = setup({}, { showAllergens: true }, { tpapi: { isEnabled: true, lastSuccessAt: null, lastSyncAt: null } });
    assert.equal((await svc.bootstrap("resto-a")).catalogReady, false);
  });
});
