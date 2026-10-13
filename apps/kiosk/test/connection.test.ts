import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OFFLINE_AFTER_FAILURES, connectionState } from "../src/lib/connection";
import { ApiError, isTillError } from "../src/lib/api";

describe("when the kiosk stops for a lost connection", () => {
  it("works while everything answers", () => {
    assert.equal(connectionState({ browserOnline: true, failedPolls: 0, tillOk: true }), "ok");
  });
  it("stops at once when the browser says the cable or the Wi-Fi is gone", () => {
    assert.equal(connectionState({ browserOnline: false, failedPolls: 0, tillOk: true }), "no-internet");
  });
  it("one unanswered check is not an outage; two in a row are (Wi-Fi without internet, server unreachable)", () => {
    assert.equal(connectionState({ browserOnline: true, failedPolls: OFFLINE_AFTER_FAILURES - 1, tillOk: true }), "ok");
    assert.equal(connectionState({ browserOnline: true, failedPolls: OFFLINE_AFTER_FAILURES, tillOk: true }), "no-internet");
  });
  it("stops when the server says it cannot reach the till; the kiosk's own internet is said first", () => {
    assert.equal(connectionState({ browserOnline: true, failedPolls: 0, tillOk: false }), "no-till");
    assert.equal(connectionState({ browserOnline: false, failedPolls: 0, tillOk: false }), "no-internet");
  });
  it("recognises the server's 'till unreachable' answer", () => {
    assert.equal(isTillError(new ApiError("x", 503, "TILL_UNREACHABLE")), true);
    assert.equal(isTillError(new ApiError("x", 503, "RESTAURANT_UNAVAILABLE")), false);
  });
});
