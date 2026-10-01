import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hydrateCatalog, type CatalogOptionGroup, type OptionKind, type RawCatalog } from "../src/lib/api";
import { KIND_ORDER, isComplete, isExtra, limits, preselected, toggled } from "../src/lib/options";

const group = (kind: OptionKind, requiredChoices: number | null = null, n = 3, id = `${kind}-${requiredChoices}`): CatalogOptionGroup => ({
  id, kind, requiredChoices, name: id,
  items: Array.from({ length: n }, (_, i) => ({ articleId: `${id}-${i}`, name: `i${i}`, price: 0 })),
});

describe("how many a customer may pick, by kind of option", () => {
  it("must-have is exactly one", () => assert.deepEqual(limits(group("MUST_HAVE")), { min: 1, max: 1 }));
  it("free option is one or none", () => assert.deepEqual(limits(group("FREE_OPTION")), { min: 0, max: 1 }));
  it("supplements and condiments are optional and unlimited", () => {
    for (const k of ["SUPPLEMENT", "CONDIMENT"] as const) assert.deepEqual(limits(group(k)), { min: 0, max: Infinity });
  });
  it("an 'exactly N' group is exactly N", () => assert.deepEqual(limits(group("MUST_HAVE", 2)), { min: 2, max: 2 }));
  it("only supplements and condiments are folded away", () => {
    assert.deepEqual(KIND_ORDER.filter((k) => isExtra({ kind: k })), ["SUPPLEMENT", "CONDIMENT"]);
  });
});

describe("tapping a choice", () => {
  it("a must-have choice is replaced by another and can never be cleared", () => {
    const g = group("MUST_HAVE");
    assert.deepEqual(toggled(g, [], "a"), ["a"]);
    assert.deepEqual(toggled(g, ["a"], "b"), ["b"]);
    assert.deepEqual(toggled(g, ["a"], "a"), ["a"]);
  });
  it("a free option can be cleared by tapping it again", () => {
    const g = group("FREE_OPTION");
    assert.deepEqual(toggled(g, ["a"], "a"), []);
    assert.deepEqual(toggled(g, ["a"], "b"), ["b"]);
  });
  it("supplements take several choices, each once", () => {
    const g = group("SUPPLEMENT");
    let c: string[] = [];
    c = toggled(g, c, "a"); c = toggled(g, c, "b");
    assert.deepEqual(c, ["a", "b"]);
    assert.deepEqual(toggled(g, c, "a"), ["b"]);
  });
  it("an 'exactly 2' group stops at 2", () => {
    const g = group("MUST_HAVE", 2);
    assert.deepEqual(toggled(g, ["a", "b"], "c"), ["a", "b"]);
    assert.deepEqual(toggled(g, ["a", "b"], "a"), ["b"]);
  });
});

describe("is the group finished", () => {
  it("must-have needs one, extras need none", () => {
    assert.equal(isComplete(group("MUST_HAVE"), []), false);
    assert.equal(isComplete(group("MUST_HAVE"), ["a"]), true);
    assert.equal(isComplete(group("SUPPLEMENT"), []), true);
    assert.equal(isComplete(group("CONDIMENT"), ["a", "b", "c"]), true);
  });
  it("'exactly 2' needs 2", () => {
    const g = group("MUST_HAVE", 2);
    assert.equal(isComplete(g, ["a"]), false);
    assert.equal(isComplete(g, ["a", "b"]), true);
  });
  it("a required group with a single choice is pre-chosen; optional ones are not", () => {
    const only = group("MUST_HAVE", null, 1, "only");
    const extra = group("SUPPLEMENT", null, 1, "extra");
    assert.deepEqual(preselected([only, extra, group("MUST_HAVE", null, 3, "many")]), { only: ["only-0"] });
  });
});

describe("hydrating the catalog", () => {
  const items = [{ articleId: "x", name: "X", price: 1 }];
  const raw = {
    currency: "EUR", categories: [],
    groupDefs: { g1: { name: "Extras", items } },
    products: [
      { id: "p", optionGroups: [{ id: "g1", kind: "SUPPLEMENT", requiredChoices: null }, { id: "gone", kind: "CONDIMENT", requiredChoices: null }] },
      { id: "q", optionGroups: [{ id: "g1", kind: "CONDIMENT", requiredChoices: null }] },
    ],
  } as unknown as RawCatalog;

  it("joins each group with its name and choices, keeping the kind the product uses it as", () => {
    const c = hydrateCatalog(raw);
    assert.deepEqual(c.products[0]!.optionGroups.map((g) => [g.id, g.kind, g.name]), [["g1", "SUPPLEMENT", "Extras"]]);
    assert.equal(c.products[1]!.optionGroups[0]!.kind, "CONDIMENT");
  });
  it("shares one copy of the choices between products", () => {
    const c = hydrateCatalog(raw);
    assert.equal(c.products[0]!.optionGroups[0]!.items, c.products[1]!.optionGroups[0]!.items);
  });
});
