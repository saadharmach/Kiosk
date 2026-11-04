import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readTableRanges, tableInRanges } from "../src/common/table-ranges.js";

describe("readTableRanges", () => {
  it("reads TPAPI's PascalCase shape", () => {
    assert.deepEqual(readTableRanges([{ FromTable: 1, ToTable: 12, Extra: [] }]), [{ fromTable: 1, toTable: 12 }]);
  });

  it("reads the camelCase shape too", () => {
    assert.deepEqual(readTableRanges([{ fromTable: 701, toTable: 763 }]), [{ fromTable: 701, toTable: 763 }]);
  });

  it("never trusts the shape: junk is skipped, not thrown", () => {
    assert.deepEqual(readTableRanges(null), []);
    assert.deepEqual(readTableRanges("x"), []);
    assert.deepEqual(readTableRanges({}), []);
    assert.deepEqual(readTableRanges([null, 5, "a", [], {}, { FromTable: "a", ToTable: 2 }, { FromTable: 1 }]), []);
  });

  it("keeps the good entries next to bad ones", () => {
    assert.deepEqual(readTableRanges([{ FromTable: 1, ToTable: 3 }, { nope: 1 }, { fromTable: 7, toTable: 9 }]), [
      { fromTable: 1, toTable: 3 },
      { fromTable: 7, toTable: 9 },
    ]);
  });
});

describe("tableInRanges", () => {
  const ranges = readTableRanges([{ FromTable: 1, ToTable: 12 }, { FromTable: 50, ToTable: 50 }, { FromTable: 701, ToTable: 763 }]);

  it("includes both ends of a range", () => {
    for (const n of [1, 12, 50, 701, 763]) assert.equal(tableInRanges(n, ranges), true, String(n));
  });

  it("rejects numbers between and outside the ranges", () => {
    for (const n of [0, 13, 49, 51, 700, 764, 9999, -1]) assert.equal(tableInRanges(n, ranges), false, String(n));
  });

  it("accepts nothing when there are no ranges", () => {
    assert.equal(tableInRanges(1, []), false);
  });

  it("fails closed on NaN", () => {
    assert.equal(tableInRanges(Number.NaN, ranges), false);
  });
});
