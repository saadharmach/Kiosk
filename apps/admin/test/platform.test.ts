import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ago, passwordProblem, posState, tabFor, type AttentionKind, type PosHealth } from "../src/lib/platform";

const health = (over: Partial<PosHealth> = {}): PosHealth => ({ isEnabled: true, lastSuccessAt: null, lastFailureAt: null, lastSyncAt: null, ...over });

describe("does the restaurant's till link work?", () => {
  it("no connection at all", () => assert.equal(posState(null), "NOT_SET_UP"));
  it("switched off, whatever happened before", () => assert.equal(posState(health({ isEnabled: false, lastSuccessAt: "2026-10-01T10:00:00Z" })), "DISABLED"));
  it("never tested", () => assert.equal(posState(health()), "UNTESTED"));
  it("last answer was a success", () => assert.equal(posState(health({ lastSuccessAt: "2026-10-01T10:00:00Z" })), "CONNECTED"));
  it("last answer was a failure, even if it worked before", () => {
    assert.equal(posState(health({ lastSuccessAt: "2026-10-01T10:00:00Z", lastFailureAt: "2026-10-01T11:00:00Z" })), "FAILING");
    assert.equal(posState(health({ lastFailureAt: "2026-10-01T11:00:00Z" })), "FAILING");
  });
  it("a success after an old failure means it recovered", () => {
    assert.equal(posState(health({ lastSuccessAt: "2026-10-01T12:00:00Z", lastFailureAt: "2026-10-01T11:00:00Z" })), "CONNECTED");
  });
});

describe("how long ago", () => {
  const now = Date.parse("2026-10-01T12:00:00Z");
  it("reads in the unit that matters", () => {
    assert.equal(ago(null, now), "never");
    assert.equal(ago("2026-10-01T11:59:40Z", now), "just now");
    assert.equal(ago("2026-10-01T11:30:00Z", now), "30 min ago");
    assert.equal(ago("2026-10-01T07:00:00Z", now), "5 h ago");
    assert.equal(ago("2026-09-28T12:00:00Z", now), "3 days ago");
  });
  it("a clock a little ahead never reads as negative", () => assert.equal(ago("2026-10-01T12:00:30Z", now), "just now"));
});

describe("where a finding takes you", () => {
  it("to the tab where it can be looked at", () => {
    assert.equal(tabFor("NO_OWNER"), "Users");
    for (const k of ["TILL_FAILING", "SYNC_FAILING", "STALE_SYNC", "NEVER_SYNCED", "NO_TILL", "TILL_DISABLED"] as AttentionKind[]) assert.equal(tabFor(k), "unTill", k);
    for (const k of ["ORDERS_STUCK", "ORDERS_FAILED"] as AttentionKind[]) assert.equal(tabFor(k), "Orders", k);
  });
});

describe("the new-password rule", () => {
  it("at least 12 characters, typed the same twice, and not the old one", () => {
    assert.equal(passwordProblem("twelve-chars!", "twelve-chars!", "old"), null);
    assert.match(passwordProblem("short", "short", "old")!, /at least 12/);
    assert.match(passwordProblem("eleven-char", "eleven-char", "old")!, /at least 12/);
    assert.match(passwordProblem("twelve-chars!", "twelve-chars?", "old")!, /not the same/);
    assert.match(passwordProblem("twelve-chars!", "twelve-chars!", "twelve-chars!")!, /different/);
  });
});
