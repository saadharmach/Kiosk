import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TillWatchService } from "../src/sync/till-watch.service.js";

const R = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-10-13T12:00:00Z");

/** A till that answers as told, and a database that records what the watch writes. */
function setup(answers: ("ok" | "fail" | "throw")[], start = { pingFailures: 0 }) {
  const row: any = { restaurantId: R, pingFailures: start.pingFailures, unreachableSince: null, lastErrorMessage: "old" };
  const writes: any[] = [];
  const logs: any[] = [];
  const prisma: any = {
    tpapiConnection: {
      updateMany: async (a: any) => {
        writes.push(a);
        assert.deepEqual(a.where, { restaurantId: R }, "every write is scoped to the restaurant");
        const { pingFailures, ...rest } = a.data;
        if (pingFailures && typeof pingFailures === "object") row.pingFailures += pingFailures.increment;
        else if (pingFailures !== undefined) row.pingFailures = pingFailures;
        Object.assign(row, rest);
        return { count: 1 };
      },
    },
    integrationLog: { create: async (a: any) => { logs.push(a.data); } },
  };
  let n = 0;
  const clients: any = {
    forRestaurant: async (_id: string, opts: any) => {
      assert.ok(opts.timeoutMs <= 10_000, "a quick ping, not the usual minute");
      const a = answers[n++];
      if (a === "throw") throw new Error("No credentials stored");
      return { client: { ping: async () => (a === "ok" ? { ok: true, durationMs: 40, returnCode: 0 } : { ok: false, durationMs: 10_000, error: "connect ETIMEDOUT" }) } };
    },
  };
  const svc = new TillWatchService(prisma, clients);
  const ping = async () => svc.check(R, row.pingFailures, NOW);
  return { svc, row, writes, logs, ping };
}

describe("the server keeps an eye on each till", () => {
  it("a till that answers stays at zero failures and writes nothing to the till log", async () => {
    const { row, logs, ping } = setup(["ok", "ok"]);
    assert.equal(await ping(), true);
    assert.equal(await ping(), true);
    assert.equal(row.pingFailures, 0);
    assert.equal(logs.length, 0);
  });

  it("one lost answer: counted, the moment noted, but not yet an outage (nothing in the log)", async () => {
    const { row, logs, ping } = setup(["fail"]);
    assert.equal(await ping(), false);
    assert.equal(row.pingFailures, 1);
    assert.equal(row.unreachableSince, NOW);
    assert.equal(row.lastErrorMessage, "connect ETIMEDOUT");
    assert.equal(logs.length, 0);
  });

  it("the second in a row stops the kiosks and is written to the till log once; more failures add nothing", async () => {
    const { row, logs, ping } = setup(["fail", "fail", "fail", "fail"]);
    for (let i = 0; i < 4; i++) await ping();
    assert.equal(row.pingFailures, 4);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].ok, false);
    assert.match(logs[0].message, /stop taking orders/);
    assert.equal(row.unreachableSince, NOW, "the start of the outage is kept");
  });

  it("the first answer after an outage puts the kiosks back and says so in the log", async () => {
    const { row, logs, ping } = setup(["ok"], { pingFailures: 3 });
    assert.equal(await ping(), true);
    assert.equal(row.pingFailures, 0);
    assert.equal(row.unreachableSince, null);
    assert.equal(row.lastErrorMessage, null);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].ok, true);
  });

  it("a till that cannot even be asked (no credentials, switched off meanwhile) counts as not answering", async () => {
    const { row, ping } = setup(["throw"]);
    assert.equal(await ping(), false);
    assert.equal(row.pingFailures, 1);
    assert.equal(row.lastErrorMessage, "No credentials stored");
  });
});

describe("each round", () => {
  it("asks only active restaurants with a connection switched on and credentials, and nothing escapes", async () => {
    let where: any;
    const prisma: any = { tpapiConnection: { findMany: async (a: any) => { where = a.where; throw new Error("database is slow"); } } };
    const svc = new TillWatchService(prisma, {} as never);
    await assert.doesNotReject(svc.safeTick());
    assert.deepEqual(where, { isEnabled: true, credentialsCiphertext: { not: null }, restaurant: { status: "ACTIVE" } });
  });

  it("never starts a round while the last one still waits on a slow till", async () => {
    let rounds = 0;
    let release!: () => void;
    const prisma: any = { tpapiConnection: { findMany: async () => { rounds++; await new Promise<void>((r) => { release = r; }); return []; } } };
    const svc = new TillWatchService(prisma, {} as never);
    const first = svc.safeTick();
    await svc.safeTick();
    release();
    await first;
    assert.equal(rounds, 1);
  });

  it("one till failing to be checked does not stop the others", async () => {
    const checked: string[] = [];
    const prisma: any = { tpapiConnection: { findMany: async () => [{ restaurantId: "a", pingFailures: 0 }, { restaurantId: "b", pingFailures: 0 }] } };
    const svc = new TillWatchService(prisma, {} as never);
    svc.check = async (id: string) => { checked.push(id); if (id === "a") throw new Error("boom"); return true; };
    await assert.doesNotReject(svc.safeTick());
    assert.deepEqual(checked.sort(), ["a", "b"]);
  });
});
