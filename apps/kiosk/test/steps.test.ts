import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { OptionKind } from "../src/lib/api";
import { isNewToday } from "../src/lib/new-badge";
import { orderedSteps } from "../src/lib/steps";

const g = (id: string, kind: OptionKind, requiredChoices: number | null = null) => ({ id, kind, requiredChoices });
const ids = (l: { id: string }[]) => l.map((x) => x.id);

describe("the order of the steps on the product sheet", () => {
  it("required groups come first, then the extras", () => {
    const groups = [g("sup", "SUPPLEMENT"), g("sauce", "MUST_HAVE"), g("free", "FREE_OPTION"), g("cond", "CONDIMENT")];
    assert.deepEqual(ids(orderedSteps(groups)), ["sauce", "free", "sup", "cond"]);
  });

  it("required groups keep the till's order between them", () => {
    const groups = [g("b", "MUST_HAVE"), g("x", "CONDIMENT"), g("a", "MUST_HAVE")];
    assert.deepEqual(ids(orderedSteps(groups)), ["b", "a", "x"]);
  });

  it("a 'choose N' group is required whatever its kind; a 'choose 0' one is not", () => {
    const groups = [g("extra", "SUPPLEMENT"), g("two", "FREE_OPTION", 2), g("none", "FREE_OPTION", 0)];
    assert.deepEqual(ids(orderedSteps(groups)), ["two", "none", "extra"]);
  });

  it("optional groups of the same kind keep the till's order", () => {
    const groups = [g("s2", "SUPPLEMENT"), g("c1", "CONDIMENT"), g("s1", "SUPPLEMENT")];
    assert.deepEqual(ids(orderedSteps(groups)), ["s2", "s1", "c1"]);
  });
});

describe("the New ribbon", () => {
  const day = new Date(2026, 9, 24, 23, 30); // 24 October, late evening, local time

  it("not marked: no ribbon", () => {
    assert.equal(isNewToday({ isNew: false, newUntil: null }, day), false);
    assert.equal(isNewToday({}, day), false);
  });

  it("marked with no last day: always", () => {
    assert.equal(isNewToday({ isNew: true, newUntil: null }, day), true);
  });

  it("the last day itself is still new; the day after is not", () => {
    assert.equal(isNewToday({ isNew: true, newUntil: "2026-10-24" }, day), true);
    assert.equal(isNewToday({ isNew: true, newUntil: "2026-10-23" }, day), false);
    assert.equal(isNewToday({ isNew: true, newUntil: "2026-11-01" }, day), true);
  });
});
