import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { orderItemTypeFor } from "../src/orders/order-submit.service.js";
import { allowedGroups, type ArticleOptionLink } from "../src/kiosk/option-kinds.js";

const link = (id: bigint, over: Partial<ArticleOptionLink> = {}): ArticleOptionLink => ({ optionGroupId: id, requiredChoices: null, isFreeOption: false, ...over });

describe("allowedGroups", () => {
  it("lists the article's own groups as must-have, and its free group as free", () => {
    const g = allowedGroups([link(1n), link(2n, { isFreeOption: true })]);
    assert.deepEqual(g.map((x) => [x.groupId, x.kind]), [[1n, "MUST_HAVE"], [2n, "FREE_OPTION"]]);
  });

  it("adds the department's supplement and condiment groups after them", () => {
    const g = allowedGroups([link(1n)], { supplementOptionId: 80n, condimentOptionId: 90n });
    assert.deepEqual(g.map((x) => x.kind), ["MUST_HAVE", "SUPPLEMENT", "CONDIMENT"]);
    assert.deepEqual(g.map((x) => x.groupId), [1n, 80n, 90n]);
  });

  it("orders must-have, free, supplement, condiment whatever order they arrive in", () => {
    const g = allowedGroups([link(2n, { isFreeOption: true }), link(1n)], { supplementOptionId: 80n, condimentOptionId: 90n });
    assert.deepEqual(g.map((x) => x.kind), ["MUST_HAVE", "FREE_OPTION", "SUPPLEMENT", "CONDIMENT"]);
  });

  it("keeps the order unTill gave inside one kind", () => {
    assert.deepEqual(allowedGroups([link(3n), link(1n), link(2n)]).map((x) => x.groupId), [3n, 1n, 2n]);
  });

  it("only an article's own groups can ask for 'exactly N'", () => {
    const g = allowedGroups([link(1n, { requiredChoices: 3 })], { supplementOptionId: 80n, condimentOptionId: null });
    assert.deepEqual(g.map((x) => x.requiredChoices), [3, null]);
  });

  it("offers nothing extra when the department has no such groups, or there is no department", () => {
    assert.deepEqual(allowedGroups([link(1n)], { supplementOptionId: null, condimentOptionId: null }).length, 1);
    assert.deepEqual(allowedGroups([link(1n)], null).length, 1);
    assert.deepEqual(allowedGroups([], undefined), []);
  });

  it("lets a group the article already uses keep its own meaning instead of becoming a supplement", () => {
    const g = allowedGroups([link(80n)], { supplementOptionId: 80n, condimentOptionId: 90n });
    assert.deepEqual(g.map((x) => [x.groupId, x.kind]), [[80n, "MUST_HAVE"], [90n, "CONDIMENT"]]);
  });

  it("never lists a group twice", () => {
    const g = allowedGroups([link(1n)], { supplementOptionId: 80n, condimentOptionId: 80n });
    assert.deepEqual(g.map((x) => x.groupId), [1n, 80n]);
  });
});

describe("orderItemTypeFor: the codes sent to unTill (confirmed by unTill)", () => {
  it("maps each kind to its OrderItemType", () => {
    assert.equal(orderItemTypeFor("OPTION", false), 1, "must-have option");
    assert.equal(orderItemTypeFor("OPTION", true), 2, "free option");
    assert.equal(orderItemTypeFor("SUPPLEMENT", false), 3);
    assert.equal(orderItemTypeFor("CONDIMENT", false), 4);
    assert.equal(orderItemTypeFor("MENU_CHOICE", false), 5, "component inside a menu");
    assert.equal(orderItemTypeFor("TEXT", false), 6, "free text");
    assert.equal(orderItemTypeFor("REMOVAL", false), 6);
  });

  it("the free-option flag only matters for plain options", () => {
    for (const kind of ["SUPPLEMENT", "CONDIMENT", "MENU_CHOICE", "TEXT"]) {
      assert.equal(orderItemTypeFor(kind, true), orderItemTypeFor(kind, false), kind);
    }
  });
});
