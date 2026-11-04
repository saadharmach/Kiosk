import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decideRefresh } from "../src/lib/refresh";

describe("when the kiosk reloads after a change", () => {
  const changed = { known: "2026-10-07T10:00:00.000Z", latest: "2026-10-07T10:05:00.000Z" };
  it("on the welcome screen: at once", () => {
    assert.equal(decideRefresh({ ...changed, screen: "WELCOME", problem: false }), "now");
  });
  it("in the middle of someone's order: later, never under their fingers", () => {
    for (const screen of ["ORDER_TYPE", "TABLE", "MENU", "CART", "TICKET"]) assert.equal(decideRefresh({ ...changed, screen, problem: false }), "later", screen);
  });
  it("on an error or 'unavailable' screen: at once, whatever the screen was", () => {
    assert.equal(decideRefresh({ ...changed, screen: "MENU", problem: true }), "now");
  });
  it("nothing changed, or no answer: nothing", () => {
    assert.equal(decideRefresh({ known: changed.known, latest: changed.known, screen: "WELCOME", problem: false }), "no");
    assert.equal(decideRefresh({ known: changed.known, latest: null, screen: "WELCOME", problem: true }), "no");
  });
});
