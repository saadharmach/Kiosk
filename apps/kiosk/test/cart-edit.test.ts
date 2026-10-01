import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CatalogOptionGroup } from "../src/lib/api";
import { previouslyPicked } from "../src/lib/options";
import { replaceLine, type CartLine } from "../src/state/cart";

const opt = (g: string, a: string) => ({ optionGroupId: g, articleId: a, name: a, price: 1, kind: "SUPPLEMENT" as const });
const line = (key: string, articleId: string, options = [opt("g", "a")], quantity = 1): CartLine =>
  ({ key, articleId, name: articleId, quantity, options, unitPrice: 5 });
const { key: _k, quantity: _q, ...bare } = line("x", "burger", [opt("g", "b")]);

// A line's key is its article, size and options, so we build keys the way the cart does.
const keyOf = (articleId: string, ...opts: [string, string][]) =>
  [articleId, "", ...opts.map(([g, a]) => `${g}:${a}`).sort()].join("|");

describe("saving an edited cart line", () => {
  it("replaces the line where it was, keeping the order of the cart", () => {
    const lines = [line("k1", "soup"), line(keyOf("burger", ["g", "a"]), "burger"), line("k3", "cake")];
    const out = replaceLine(lines, lines[1]!.key, bare, 3);
    assert.deepEqual(out.map((l) => l.articleId), ["soup", "burger", "cake"]);
    assert.equal(out[1]!.quantity, 3);
    assert.deepEqual(out[1]!.options.map((o) => o.articleId), ["b"]);
    assert.equal(out[1]!.key, keyOf("burger", ["g", "b"]));
  });

  it("merges into an identical line instead of showing the same dish twice", () => {
    const twinKey = keyOf("burger", ["g", "b"]);
    const lines = [line("old", "burger", [opt("g", "a")], 2), line(twinKey, "burger", [opt("g", "b")], 1)];
    const out = replaceLine(lines, "old", bare, 2);
    assert.equal(out.length, 1);
    assert.equal(out[0]!.key, twinKey);
    assert.equal(out[0]!.quantity, 3);
  });

  it("leaves other lines untouched and never loses the edited one", () => {
    const lines = [line("k1", "soup"), line("old", "burger")];
    const out = replaceLine(lines, "old", { ...bare, options: [] }, 1);
    assert.equal(out.length, 2);
    assert.deepEqual(out[0], lines[0]);
  });
});

describe("reopening a cart line", () => {
  const group = (id: string, ...items: string[]): CatalogOptionGroup =>
    ({ id, kind: "SUPPLEMENT", name: id, requiredChoices: null, items: items.map((a) => ({ articleId: a, name: a, price: 1 })) });

  it("returns the choices the line holds, per group", () => {
    const l = { options: [opt("g1", "a"), opt("g1", "b"), opt("g2", "c")] };
    assert.deepEqual(previouslyPicked([group("g1", "a", "b", "z"), group("g2", "c")], l), { g1: ["a", "b"], g2: ["c"] });
  });

  it("drops a choice or a group that has left the menu, and leaves new groups to their defaults", () => {
    const l = { options: [opt("g1", "gone"), opt("g1", "a"), opt("old", "q")] };
    assert.deepEqual(previouslyPicked([group("g1", "a"), group("fresh", "n")], l), { g1: ["a"] });
  });
});
