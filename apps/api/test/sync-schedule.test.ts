import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { consecutiveFailures, isSyncDue, nextSyncAt, syncConfigFromEnv, type RunFacts, type SyncConfig } from "../src/sync/sync-schedule.js";

const NOW = Date.parse("2026-10-01T12:00:00Z");
const MIN = 60_000;
const at = (minAgo: number) => new Date(NOW - minAgo * MIN);
const run = (status: RunFacts["status"], minAgo: number): RunFacts => ({ status, startedAt: at(minAgo) });
const cfg: SyncConfig = { intervalMin: 60, retryMin: 15 };
const due = (runs: RunFacts[], c = cfg) => isSyncDue(runs, c, NOW);

describe("when a restaurant's menu is read again", () => {
  it("right away when it has never been read", () => assert.equal(due([]), true));

  it("after a good run: one interval later, not before", () => {
    assert.equal(due([run("SUCCESS", 59)]), false);
    assert.equal(due([run("SUCCESS", 61)]), true);
    assert.equal(due([run("PARTIAL", 30)]), false);
    assert.equal(due([run("PARTIAL", 61)]), true);
  });

  it("a manual sync counts: pressing the button restarts the wait (the schedule does not care who started a run)", () => {
    assert.equal(due([run("SUCCESS", 5), run("SUCCESS", 90)]), false);
  });

  it("after a failure: a first retry soon, then twice as long each time, never beyond the interval", () => {
    assert.equal(due([run("FAILED", 14)]), false);
    assert.equal(due([run("FAILED", 16)]), true);                                 // 15 min after the first failure
    assert.equal(due([run("FAILED", 29), run("FAILED", 50)]), false);              // second failure: wait 30
    assert.equal(due([run("FAILED", 31), run("FAILED", 50)]), true);
    assert.equal(due([run("FAILED", 59), run("FAILED", 90), run("FAILED", 130), run("FAILED", 200)]), false);   // capped at 60
    assert.equal(due([run("FAILED", 61), run("FAILED", 90), run("FAILED", 130), run("FAILED", 200)]), true);
  });

  it("a success ends the run of failures, so the next failure starts the backoff over", () => {
    assert.equal(due([run("FAILED", 16), run("SUCCESS", 40), run("FAILED", 80)]), true);   // only one failure counts: 15 min
    assert.equal(due([run("FAILED", 14), run("SUCCESS", 40), run("FAILED", 80)]), false);
  });

  it("never while a sync is running; but one that has been 'running' for 10+ minutes is dead and counts as a failure", () => {
    assert.equal(due([run("RUNNING", 3)]), false);
    assert.equal(due([run("RUNNING", 9)]), false);
    assert.equal(due([run("RUNNING", 11)]), false);   // died 11 min ago: retry only after the 15 min backoff
    assert.equal(due([run("RUNNING", 16)]), true);
  });

  it("with a short interval, still waits for a sync that is running (it may take longer than the interval)", () => {
    const short: SyncConfig = { intervalMin: 5, retryMin: 2 };
    assert.equal(due([run("RUNNING", 7)], short), false);
    assert.equal(due([run("SUCCESS", 7)], short), true);
  });

  it("never when switched off", () => {
    assert.equal(due([], { intervalMin: 0, retryMin: 15 }), false);
    assert.equal(due([run("SUCCESS", 500)], { intervalMin: 0, retryMin: 15 }), false);
  });

  it("tells the screen when the next read is due", () => {
    assert.equal(nextSyncAt([run("SUCCESS", 20)], cfg, NOW)!.getTime(), NOW + 40 * MIN);
    assert.equal(nextSyncAt([], cfg, NOW), null);
  });
});

describe("counting failures in a row", () => {
  it("counts the newest run of failures only", () => {
    assert.equal(consecutiveFailures([], NOW), 0);
    assert.equal(consecutiveFailures([run("SUCCESS", 5), run("FAILED", 30)], NOW), 0);
    assert.equal(consecutiveFailures([run("FAILED", 5), run("FAILED", 30), run("SUCCESS", 60), run("FAILED", 90)], NOW), 2);
    assert.equal(consecutiveFailures([run("RUNNING", 30), run("FAILED", 60)], NOW), 2);   // the dead run counts
    assert.equal(consecutiveFailures([run("RUNNING", 2), run("FAILED", 60)], NOW), 0);    // a live one is not a failure
  });
});

describe("the settings", () => {
  it("default to hourly, retrying from 15 minutes", () => assert.deepEqual(syncConfigFromEnv({}), { intervalMin: 60, retryMin: 15 }));
  it("can be changed, or switched off with 0", () => {
    assert.deepEqual(syncConfigFromEnv({ CATALOG_SYNC_INTERVAL_MIN: "30", CATALOG_SYNC_RETRY_MIN: "5" }), { intervalMin: 30, retryMin: 5 });
    assert.equal(syncConfigFromEnv({ CATALOG_SYNC_INTERVAL_MIN: "0" }).intervalMin, 0);
  });
  it("junk falls back to the defaults, and the retry is never 0", () => {
    assert.deepEqual(syncConfigFromEnv({ CATALOG_SYNC_INTERVAL_MIN: "soon", CATALOG_SYNC_RETRY_MIN: "-3" }), { intervalMin: 60, retryMin: 15 });
    assert.equal(syncConfigFromEnv({ CATALOG_SYNC_RETRY_MIN: "0" }).retryMin, 1);
  });
});
