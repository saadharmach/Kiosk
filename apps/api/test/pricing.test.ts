import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PricingService } from "../src/kiosk/pricing.service.js";
import { D, model } from "./helpers/fake-prisma.js";

const AREA = 100n;

const article = (id: bigint, name: string, over: Record<string, unknown> = {}) => ({
  untillId: id, name, isActive: true, isPresent: true, isMenu: false,
  sizeModifierId: null, availableSalesAreaIds: [AREA], departmentId: null, ...over,
});

/** A small restaurant: a burger with sauces, a sized drink, a steak with a "choose 3" group, and some traps. */
function world() {
  return {
    tpapiSalesArea: [{ untillId: AREA, priceLevelId: 10n, number: 1 }],
    tpapiArticle: [
      article(1n, "Burger", { departmentId: 1n }),
      article(2n, "Cola", { sizeModifierId: 7n, departmentId: 2n }),
      article(4n, "Ketchup"), article(11n, "Mayo"),
      article(31n, "Extra cheese"), article(32n, "Bacon"), article(33n, "No onions"), article(34n, "Well done"), article(35n, "Extra sauce"),
      article(8n, "Steak", { departmentId: 1n }),
      article(2n + 100n, "unused", { departmentId: 2n }),
      article(12n, "Pepper"), article(13n, "Mushroom"), article(14n, "Garlic"), article(15n, "Bearnaise"),
      article(5n, "Hidden"),
      article(6n, "Inactive", { isActive: false }),
      article(9n, "Free sample"),
      article(10n, "Menu of the day", { isMenu: true }),
      article(20n, "Elsewhere", { availableSalesAreaIds: [999n] }),
    ],
    tpapiArticlePrice: [
      { articleId: 1n, amount: D(10), vat: D(10) },
      { articleId: 8n, amount: D(20), vat: D(10) },
      { articleId: 9n, amount: D(0), vat: D(10) },
      { articleId: 5n, amount: D(5), vat: D(10) },
      { articleId: 6n, amount: D(5), vat: D(10) },
      { articleId: 20n, amount: D(5), vat: D(10) },
    ],
    tpapiArticleSizePrice: [
      { articleId: 2n, sizeItemId: 71n, amount: D(3) },
      { articleId: 2n, sizeItemId: 72n, amount: D(5) },
    ],
    tpapiSizeModifierItem: [{ untillId: 71n, name: "Small" }, { untillId: 72n, name: "Large" }],
    tpapiArticleOption: [
      { articleId: 1n, optionGroupId: 50n, requiredChoices: null, isFreeOption: false },
      { articleId: 8n, optionGroupId: 60n, requiredChoices: 3, isFreeOption: false },
    ],
    // Department 1 (burgers, steaks) has supplements and condiments; department 2 (drinks) has neither.
    tpapiDepartment: [
      { untillId: 1n, supplementOptionId: 80n, condimentOptionId: 90n },
      { untillId: 2n, supplementOptionId: null, condimentOptionId: null },
    ],
    tpapiOptionGroup: [{ untillId: 50n, name: "Sauce" }, { untillId: 60n, name: "Drinks Options" }, { untillId: 80n, name: "Extras" }, { untillId: 90n, name: "Instructions" }],
    tpapiOptionItem: [
      { optionGroupId: 50n, articleId: 4n, amount: D(0.5), vat: D(10) },
      { optionGroupId: 50n, articleId: 11n, amount: D(0), vat: null },
      { optionGroupId: 60n, articleId: 12n, amount: D(1), vat: D(10) },
      { optionGroupId: 60n, articleId: 13n, amount: D(1), vat: D(10) },
      { optionGroupId: 60n, articleId: 14n, amount: D(1), vat: D(10) },
      { optionGroupId: 60n, articleId: 15n, amount: D(1), vat: D(10) },
      { optionGroupId: 80n, articleId: 31n, amount: D(1.5), vat: D(10) },
      { optionGroupId: 80n, articleId: 32n, amount: D(2), vat: D(10) },
      { optionGroupId: 90n, articleId: 33n, amount: D(0), vat: null },
      { optionGroupId: 90n, articleId: 34n, amount: D(0), vat: null },
      { optionGroupId: 90n, articleId: 35n, amount: D(0.5), vat: D(10) },
    ],
    productPresentation: [
      { articleId: 1n, isVisible: true, displayName: { fr: "Burger FR", en: "Burger EN", ar: "برغر" } },
      { articleId: 5n, isVisible: false, displayName: null },
    ],
  };
}

/** As the restaurant has it: a product with no presentation row is shown; `untouched` ones have none (hidden). */
function service(untouched: bigint[] = []) {
  const w = world();
  const has = new Set((w.productPresentation as { articleId: bigint }[]).map((r) => r.articleId));
  for (const a of w.tpapiArticle as { untillId: bigint }[]) {
    if (!has.has(a.untillId) && !untouched.includes(a.untillId)) (w.productPresentation as unknown[]).push({ articleId: a.untillId, isVisible: true, displayName: null });
  }
  const prisma = Object.fromEntries(Object.entries(w).map(([k, rows]) => [k, model(rows as never)]));
  return new PricingService(prisma as never);
}

const price = (lines: unknown[], extra: Record<string, unknown> = {}) =>
  service().price("r1", "MAD", { orderType: "EAT_IN", salesAreaId: "100", lines, ...extra } as never);

const reject = (p: Promise<unknown>, status: number, text: RegExp) =>
  assert.rejects(p, (e: { getStatus?: () => number; message: string }) => {
    assert.equal(e.getStatus?.(), status, `status for: ${e.message}`);
    assert.match(e.message, text);
    return true;
  });

describe("PricingService: base prices", () => {
  it("prices a plain product from the price list", async () => {
    const cart = await price([{ articleId: "1", quantity: 1 }]);
    assert.equal(cart.lines[0]!.unitPrice, 10);
    assert.equal(cart.total, 10);
    assert.equal(cart.currency, "MAD");
  });

  it("multiplies by quantity and sums the lines", async () => {
    const cart = await price([{ articleId: "1", quantity: 3 }, { articleId: "8", quantity: 1, options: [
      { optionGroupId: "60", articleId: "12" }, { optionGroupId: "60", articleId: "13" }, { optionGroupId: "60", articleId: "14" },
    ] }]);
    assert.equal(cart.lines[0]!.lineTotal, 30);
    assert.equal(cart.lines[1]!.lineTotal, 23);
    assert.equal(cart.subtotal, 53);
    assert.equal(cart.total, 53);
    assert.equal(cart.itemCount, 4);
  });

  it("works out the VAT included in a VAT-inclusive price", async () => {
    const cart = await price([{ articleId: "1", quantity: 1 }]);
    assert.equal(cart.taxTotal, 0.91); // 10 at 10% VAT: 10 * 10 / 110
  });

  it("uses the price level of the sales area", async () => {
    const cart = await price([{ articleId: "1", quantity: 1 }]);
    assert.equal(cart.priceLevelId, "10");
    assert.equal(cart.salesAreaId, "100");
  });
});

describe("PricingService: what cannot be sold", () => {
  it("a product nobody has shown yet cannot be ordered, even by a request that names it", async () => {
    await reject(service([2n]).price("r1", "MAD", { orderType: "EAT_IN", salesAreaId: "100", lines: [{ articleId: "2", quantity: 1, sizeItemId: "71" }] } as never), 400, /not available/);
  });

  it("rejects an empty cart", () => reject(price([]), 400, /empty/i));
  it("rejects a product that does not exist", () => reject(price([{ articleId: "999", quantity: 1 }]), 400, /not available/));
  it("rejects an inactive product", () => reject(price([{ articleId: "6", quantity: 1 }]), 400, /not available/));
  it("rejects a product hidden by the restaurant", () => reject(price([{ articleId: "5", quantity: 1 }]), 400, /not available/));
  it("rejects a product that is not sold in this zone", () => reject(price([{ articleId: "20", quantity: 1 }]), 400, /zone/));
  it("rejects a product with no price", () => reject(price([{ articleId: "4", quantity: 1 }]), 400, /No price/));
  it("refuses to sell something priced at zero", () => reject(price([{ articleId: "9", quantity: 1 }]), 400, /zero/));

  it("rejects an unknown sales area", () =>
    assert.rejects(price([{ articleId: "1", quantity: 1 }], { salesAreaId: "555" }), (e: { getStatus?: () => number }) => e.getStatus?.() === 404));
});

describe("PricingService: sizes", () => {
  it("requires a size for a sized product", () => reject(price([{ articleId: "2", quantity: 1 }]), 400, /requires a size/));
  it("rejects a size the product does not have", () => reject(price([{ articleId: "2", quantity: 1, sizeItemId: "99" }]), 400, /Unknown size/));

  it("takes the price from the chosen size and records it", async () => {
    const small = await price([{ articleId: "2", quantity: 1, sizeItemId: "71" }]);
    const large = await price([{ articleId: "2", quantity: 2, sizeItemId: "72" }]);
    assert.equal(small.lines[0]!.unitPrice, 3);
    assert.equal(large.lines[0]!.lineTotal, 10);
    assert.equal(large.lines[0]!.modifiers[0]!.kind, "SIZE");
    assert.equal(large.lines[0]!.modifiers[0]!.name, "Large");
  });
});

describe("PricingService: options", () => {
  it("adds the price of a paid option, read from the server, never from the browser", async () => {
    const cart = await price([{ articleId: "1", quantity: 1, options: [{ optionGroupId: "50", articleId: "4" }] }]);
    assert.equal(cart.lines[0]!.unitPrice, 10.5);
    assert.equal(cart.lines[0]!.modifiers[0]!.name, "Ketchup");
  });

  it("charges nothing for a free option", async () => {
    const cart = await price([{ articleId: "1", quantity: 1, options: [{ optionGroupId: "50", articleId: "11" }] }]);
    assert.equal(cart.lines[0]!.unitPrice, 10);
  });

  it("rejects an option group that is not linked to the product", () =>
    reject(price([{ articleId: "1", quantity: 1, options: [{ optionGroupId: "60", articleId: "12" }] }]), 400, /not valid for/));

  it("rejects an item that is not in the group", () =>
    reject(price([{ articleId: "1", quantity: 1, options: [{ optionGroupId: "50", articleId: "12" }] }]), 400, /Invalid choice/));

  it("enforces 'choose exactly N' groups", async () => {
    const pick = (ids: string[]) => ({ articleId: "8", quantity: 1, options: ids.map((id) => ({ optionGroupId: "60", articleId: id })) });
    await reject(price([pick([])]), 400, /exactly 3.*got 0/);
    await reject(price([pick(["12", "13"])]), 400, /exactly 3.*got 2/);
    await reject(price([pick(["12", "13", "14", "15"])]), 400, /exactly 3.*got 4/);
    const ok = await price([pick(["12", "13", "14"])]);
    assert.equal(ok.lines[0]!.unitPrice, 23);
  });
});

describe("PricingService: names in the customer's language", () => {
  const name = async (locale?: string) => (await price([{ articleId: "1", quantity: 1 }], { locale })).lines[0]!.displayName;

  it("uses the requested language", async () => {
    assert.equal(await name("en"), "Burger EN");
    assert.equal(await name("ar"), "برغر");
    assert.equal(await name("fr"), "Burger FR");
  });
  it("defaults to French and never loses the name", async () => {
    assert.equal(await name(undefined), "Burger FR");
    const cart = await price([{ articleId: "8", quantity: 1, options: [
      { optionGroupId: "60", articleId: "12" }, { optionGroupId: "60", articleId: "13" }, { optionGroupId: "60", articleId: "14" }] }], { locale: "en" });
    assert.equal(cart.lines[0]!.displayName, "Steak"); // no presentation: the unTill name
  });
});

describe("PricingService: supplements and condiments from the department", () => {
  const burger = (options: { optionGroupId: string; articleId: string }[]) => ({ articleId: "1", quantity: 1, options });
  const sup = (id: string) => ({ optionGroupId: "80", articleId: id });
  const cond = (id: string) => ({ optionGroupId: "90", articleId: id });

  it("prices a supplement from the department's supplement group, and marks it as one", async () => {
    const cart = await price([burger([sup("31")])]);
    assert.equal(cart.lines[0]!.unitPrice, 11.5);
    assert.equal(cart.lines[0]!.modifiers[0]!.kind, "SUPPLEMENT");
    assert.equal(cart.lines[0]!.modifiers[0]!.name, "Extra cheese");
  });

  it("allows several supplements on one line", async () => {
    const cart = await price([burger([sup("31"), sup("32")])]);
    assert.equal(cart.lines[0]!.unitPrice, 13.5);
    assert.deepEqual(cart.lines[0]!.modifiers.map((m) => m.kind), ["SUPPLEMENT", "SUPPLEMENT"]);
  });

  it("prices a condiment, free or paid, and marks it as one", async () => {
    const cart = await price([burger([cond("33"), cond("35")])]);
    assert.equal(cart.lines[0]!.unitPrice, 10.5);
    assert.deepEqual(cart.lines[0]!.modifiers.map((m) => m.kind), ["CONDIMENT", "CONDIMENT"]);
  });

  it("mixes every kind on one line, each keeping its own kind", async () => {
    const cart = await price([burger([{ optionGroupId: "50", articleId: "4" }, sup("32"), cond("34")])]);
    assert.deepEqual(cart.lines[0]!.modifiers.map((m) => m.kind), ["OPTION", "SUPPLEMENT", "CONDIMENT"]);
    assert.equal(cart.lines[0]!.unitPrice, 12.5);
  });

  it("multiplies supplements by the quantity like any other price", async () => {
    const cart = await price([{ articleId: "1", quantity: 3, options: [sup("31")] }]);
    assert.equal(cart.lines[0]!.lineTotal, 34.5);
  });

  it("does not offer a department's supplements to an article in another department", async () => {
    await reject(price([{ articleId: "2", quantity: 1, sizeItemId: "71", options: [sup("31")] }]), 400, /not valid for/);
  });

  it("rejects an item that is not in the supplement group", async () => {
    await reject(price([burger([{ optionGroupId: "80", articleId: "33" }])]), 400, /Invalid choice/);
  });

  it("rejects the same choice sent twice", async () => {
    await reject(price([burger([sup("31"), sup("31")])]), 400, /twice/);
    await reject(price([burger([cond("33"), cond("33")])]), 400, /twice/);
  });

  it("does not count supplements towards a 'choose exactly N' group", async () => {
    const steak = await price([{ articleId: "8", quantity: 1, options: [
      { optionGroupId: "60", articleId: "12" }, { optionGroupId: "60", articleId: "13" }, { optionGroupId: "60", articleId: "14" }, sup("31"),
    ] }]);
    assert.equal(steak.lines[0]!.unitPrice, 24.5);
  });
});
