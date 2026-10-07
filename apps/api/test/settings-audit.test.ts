import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { audit, uncovered, type OrderTypePayload, type SalesAreaPayload, type SettingsPayload } from "../src/restaurant/settings.service.js";

const settings = (over: Partial<SettingsPayload> = {}): SettingsPayload => ({
  eatInEnabled: true, takeAwayEnabled: true, deliveryEnabled: false, askTableForEatIn: false,
  kioskIdleTimeoutSec: 90, kioskResetDelaySec: 15, showAllergens: false, showProductImages: true, ticketFooterText: null, ...over,
});
const ot = (orderType: OrderTypePayload["orderType"], over: Partial<OrderTypePayload> = {}): OrderTypePayload => ({
  orderType, configured: true, isEnabled: true, salesAreaId: "1290", fixedTableNumber: null, tableRangeFrom: 1, tableRangeTo: 25, tablePart: "a", ...over,
});
// The till the "list" restaurant was moved to.
const restaurant: SalesAreaPayload = { untillId: "1290", number: 0, name: "Restaurant", tableRanges: [{ fromTable: 1, toTable: 25 }, { fromTable: 30, toTable: 48 }, { fromTable: 50, toTable: 60 }, { fromTable: 9999, toTable: 9999 }] };
const emporter: SalesAreaPayload = { untillId: "1291", number: 1, name: "Emporter", tableRanges: [{ fromTable: 101, toTable: 152 }] };
const areas = new Map([[restaurant.untillId, restaurant], [emporter.untillId, emporter]]);
const only = (ws: ReturnType<typeof audit>, code: string) => ws.filter((w) => w.code === code);

describe("what Settings warns about", () => {
  it("everything right: no error", () => {
    const ws = audit(settings(), [ot("EAT_IN"), ot("TAKE_AWAY", { salesAreaId: "1291", tableRangeFrom: 101, tableRangeTo: 152 })], areas);
    assert.deepEqual(ws.filter((w) => w.severity === "error"), []);
  });

  it("a sales area that is no longer in unTill is an error that says what happened and what to do", () => {
    const [w] = audit(settings(), [ot("EAT_IN", { salesAreaId: "1941" })], areas);
    assert.equal(w!.code, "SALES_AREA_MISSING");
    assert.equal(w!.severity, "error");
    assert.equal(w!.orderType, "EAT_IN");
    assert.match(w!.message, /^Eat in: the sales area chosen for it is no longer in unTill/);
    assert.match(w!.message, /Choose one of the current sales areas/);
    assert.ok(!w!.message.includes("EAT_IN") && !w!.message.includes("1941"), "plain words, no codes");
  });

  it("a range partly outside the area's tables names exactly the missing numbers and the tables there are", () => {
    const [w] = only(audit(settings(), [ot("EAT_IN", { tableRangeFrom: 1, tableRangeTo: 100 })], areas), "TABLE_OUTSIDE_SALES_AREA");
    assert.equal(w!.severity, "error");
    assert.match(w!.message, /unTill has no 26–29, 49 and 61–100/);
    assert.match(w!.message, /has tables 1–25, 30–48, 50–60 and 9999/);
    assert.doesNotMatch(w!.message, /every order/, "only some orders are refused");
  });

  it("a range entirely outside says every order will be refused", () => {
    const [w] = only(audit(settings(), [ot("TAKE_AWAY", { salesAreaId: "1291", tableRangeFrom: 800, tableRangeTo: 899 })], areas), "TABLE_OUTSIDE_SALES_AREA");
    assert.match(w!.message, /Take away uses tables 800–899, none of which unTill has, so it will refuse every order/);
  });

  it("a fixed table that does not exist is an error", () => {
    const [w] = only(audit(settings(), [ot("TAKE_AWAY", { salesAreaId: "1291", tableRangeFrom: null, tableRangeTo: null, fixedTableNumber: 99 })], areas), "TABLE_OUTSIDE_SALES_AREA");
    assert.match(w!.message, /table 99, which unTill does not have/);
  });

  it("switched on with no sales area, no way of ordering at all, no table source: errors", () => {
    assert.equal(only(audit(settings(), [ot("EAT_IN", { configured: false, salesAreaId: null })], areas), "NOT_CONFIGURED")[0]!.severity, "error");
    assert.equal(only(audit(settings({ eatInEnabled: false, takeAwayEnabled: false }), [], areas), "NO_ORDER_TYPE")[0]!.severity, "error");
    assert.equal(only(audit(settings(), [ot("TAKE_AWAY", { salesAreaId: "1291", tableRangeFrom: null, tableRangeTo: null })], areas), "NO_TABLE_SOURCE")[0]!.severity, "error");
  });

  it("smaller things are not errors", () => {
    const ws = audit(settings(), [ot("EAT_IN", { tablePart: null, fixedTableNumber: 5 })], areas);
    assert.equal(only(ws, "TWO_TABLE_SOURCES")[0]!.severity, "warning");
    assert.equal(only(ws, "DEFAULT_TABLE_PART")[0]!.severity, "info");
  });

  it("an order type that is switched off is not checked", () => {
    assert.deepEqual(audit(settings({ takeAwayEnabled: false }), [ot("TAKE_AWAY", { isEnabled: false, salesAreaId: "1941" })], areas), []);
  });
});

describe("which table numbers a sales area lacks", () => {
  const R = restaurant.tableRanges;
  it("finds the gaps, at the start, in the middle and at the end", () => {
    assert.deepEqual(uncovered(1, 100, R), [{ fromTable: 26, toTable: 29 }, { fromTable: 49, toTable: 49 }, { fromTable: 61, toTable: 100 }]);
    assert.deepEqual(uncovered(1, 25, R), []);
    assert.deepEqual(uncovered(20, 35, R), [{ fromTable: 26, toTable: 29 }]);
    assert.deepEqual(uncovered(800, 899, R), [{ fromTable: 800, toTable: 899 }]);
    assert.deepEqual(uncovered(9999, 9999, R), []);
    assert.deepEqual(uncovered(5, 5, []), [{ fromTable: 5, toTable: 5 }]);
  });
});
