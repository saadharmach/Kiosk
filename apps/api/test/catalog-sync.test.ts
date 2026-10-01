import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ConflictException } from "@nestjs/common";
import { CatalogSyncService, replaceAllAtomically } from "../src/sync/catalog-sync.service.js";
import { SyncSchedulerService } from "../src/sync/sync-scheduler.service.js";

type Row = Record<string, unknown>;

/** A database whose transaction really is all-or-nothing: writes are kept only if the callback finishes. */
function atomicDb(initial: Record<string, Row[]>) {
  const committed: Record<string, Row[]> = Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, [...v]]));
  const outside: string[] = [];   // writes that bypassed the transaction
  const delegate = (store: Record<string, Row[]>, name: string, viaTx: boolean) => ({
    deleteMany: async (a: { where: { restaurantId: string } }) => {
      if (!viaTx) outside.push(`${name}.deleteMany`);
      store[name] = (store[name] ?? []).filter((r) => r.restaurantId !== a.where.restaurantId);
    },
    createMany: async (a: { data: Row[] }) => {
      if (!viaTx) outside.push(`${name}.createMany`);
      if (name === "tpapiArticle" && a.data.some((r) => r.explode)) throw new Error("insert failed halfway");
      store[name] = [...(store[name] ?? []), ...a.data];
    },
  });
  const names = ["tpapiDepartment", "tpapiArticle", "tpapiArticlePrice"];
  const db: Record<string, unknown> = {
    $transaction: async (fn: (tx: unknown) => Promise<void>) => {
      const draft: Record<string, Row[]> = Object.fromEntries(Object.entries(committed).map(([k, v]) => [k, [...v]]));
      const tx = Object.fromEntries(names.map((n) => [n, delegate(draft, n, true)]));
      await fn(tx);                                  // throws → draft is simply dropped (rolled back)
      for (const [k, v] of Object.entries(draft)) committed[k] = v;
    },
  };
  for (const n of names) db[n] = delegate(committed, n, false);
  return { db, committed, outside };
}

describe("replacing the menu is all-or-nothing", () => {
  const old = { tpapiDepartment: [{ restaurantId: "r1", id: "old-d" }, { restaurantId: "r2", id: "other-d" }], tpapiArticle: [{ restaurantId: "r1", id: "old-a" }], tpapiArticlePrice: [{ restaurantId: "r1", id: "old-p" }] };

  it("swaps in the new rows for this restaurant only, leaving another restaurant's alone", async () => {
    const { db, committed, outside } = atomicDb(old);
    await replaceAllAtomically(db as never, "r1", [["tpapiDepartment", [{ restaurantId: "r1", id: "new-d" }]], ["tpapiArticle", [{ restaurantId: "r1", id: "new-a" }]], ["tpapiArticlePrice", []]]);
    assert.deepEqual(committed.tpapiDepartment!.map((r) => r.id).sort(), ["new-d", "other-d"]);
    assert.deepEqual(committed.tpapiArticle!.map((r) => r.id), ["new-a"]);
    assert.deepEqual(committed.tpapiArticlePrice, []);
    assert.deepEqual(outside, [], "every write must go through the transaction");
  });

  it("when anything fails, the previous menu is exactly as it was: no empty or half-replaced table", async () => {
    const { db, committed } = atomicDb(old);
    await assert.rejects(
      replaceAllAtomically(db as never, "r1", [["tpapiDepartment", [{ restaurantId: "r1", id: "new-d" }]], ["tpapiArticle", [{ restaurantId: "r1", id: "x", explode: true }]]]),
      /halfway/,
    );
    assert.deepEqual(committed.tpapiDepartment!.map((r) => r.id).sort(), ["old-d", "other-d"]);
    assert.deepEqual(committed.tpapiArticle!.map((r) => r.id), ["old-a"]);
  });

  it("writes big tables in batches of 500, and gives the transaction a long time", async () => {
    const batches: number[] = [];
    let opts: unknown;
    const db = {
      $transaction: async (fn: (tx: unknown) => Promise<void>, o: unknown) => { opts = o; await fn({ tpapiArticle: { deleteMany: async () => undefined, createMany: async (a: { data: unknown[] }) => { batches.push(a.data.length); } } }); },
    };
    await replaceAllAtomically(db as never, "r1", [["tpapiArticle", Array.from({ length: 1201 }, (_, i) => ({ restaurantId: "r1", id: i }))]]);
    assert.deepEqual(batches, [500, 500, 201]);
    assert.ok((opts as { timeout: number }).timeout >= 120_000);
  });
});

describe("two syncs of one restaurant never run at once", () => {
  const svc = (running: boolean) => new CatalogSyncService({ syncRun: { findFirst: async () => (running ? { id: "x" } : null) } } as never, {} as never);
  it("a second request while one is running is refused", async () => {
    await assert.rejects(svc(true).run("r1", "MANUAL"), ConflictException);
  });
});

describe("the scheduler", () => {
  const NOW = Date.parse("2026-10-01T12:00:00Z");
  const min = (m: number) => new Date(NOW - m * 60_000);

  function setup(restaurants: { id: string; slug: string }[], runs: Row[], failFor: string[] = []) {
    const synced: string[] = [];
    const queries: Row[] = [];
    const prisma = {
      restaurant: { findMany: async (a: Row) => { queries.push({ model: "restaurant", ...a }); return restaurants; } },
      syncRun: {
        findMany: async (a: Row) => { queries.push({ model: "syncRun", ...a }); return runs; },
        updateMany: async (a: Row) => { queries.push({ model: "syncRun.updateMany", ...a }); return { count: 0 }; },
      },
    };
    const sync = { run: async (id: string, trigger: string) => { assert.equal(trigger, "SCHEDULED"); if (failFor.includes(id)) throw new Error("till down"); synced.push(id); } };
    return { sched: new SyncSchedulerService(prisma as never, sync as never), synced, queries };
  }
  const R = [{ id: "r1", slug: "a" }, { id: "r2", slug: "b" }, { id: "r3", slug: "c" }];

  it("reads the menus of the restaurants whose turn has come, one after another, and skips the rest", async () => {
    const { sched, synced } = setup(R, [
      { restaurantId: "r1", status: "SUCCESS", startedAt: min(90) },   // due
      { restaurantId: "r2", status: "SUCCESS", startedAt: min(10) },   // not yet
      // r3: never synced → due
    ]);
    assert.deepEqual(await sched.tick(NOW), ["a", "c"]);
    assert.deepEqual(synced, ["r1", "r3"]);
  });

  it("one restaurant failing does not stop the others", async () => {
    const { sched, synced } = setup(R, [], ["r1"]);
    assert.deepEqual(await sched.tick(NOW), ["b", "c"]);
    assert.deepEqual(synced, ["r2", "r3"]);
  });

  it("only looks at active restaurants with a switched-on connection that has credentials", async () => {
    const { sched, queries } = setup(R, []);
    await sched.tick(NOW);
    const where = (queries.find((q) => q.model === "restaurant") as { where: Row }).where;
    assert.deepEqual(where, { status: "ACTIVE", tpapi: { is: { isEnabled: true, credentialsCiphertext: { not: null } } } });
  });

  it("does nothing at all when automatic sync is switched off", async () => {
    const { sched, synced } = setup(R, []);
    (sched as unknown as { config: { intervalMin: number } }).config = { intervalMin: 0 } as never;
    assert.deepEqual(await sched.tick(NOW), []);
    assert.deepEqual(synced, []);
  });

  it("a pass that is still going blocks the next one, so passes never overlap", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const prisma = { restaurant: { findMany: async () => { await gate; return []; } } };
    const sched = new SyncSchedulerService(prisma as never, {} as never);
    const first = sched.tick(NOW);
    assert.deepEqual(await sched.tick(NOW), []);   // returns at once
    release();
    await first;
  });

  it("on start-up, a sync that was running when the server stopped is closed as failed, so it cannot block", async () => {
    const { sched, queries } = setup([], []);
    await sched.closeInterrupted(NOW);
    const q = queries.find((x) => x.model === "syncRun.updateMany") as { where: { status: string; startedAt: { lt: Date } }; data: { status: string } };
    assert.equal(q.where.status, "RUNNING");
    assert.equal(q.where.startedAt.lt.getTime(), NOW - 10 * 60_000);
    assert.equal(q.data.status, "FAILED");
  });

  it("tells the admin screen whether it is automatic and when the next read is due", async () => {
    const prisma = { syncRun: { findMany: async () => [{ status: "SUCCESS", startedAt: min(20) }] } };
    const sched = new SyncSchedulerService(prisma as never, {} as never);
    assert.deepEqual(await sched.scheduleFor("r1", NOW), { enabled: true, intervalMin: 60, nextAt: new Date(NOW + 40 * 60_000).toISOString() });
    const never = new SyncSchedulerService({ syncRun: { findMany: async () => [] } } as never, {} as never);
    assert.deepEqual(await never.scheduleFor("r1", NOW), { enabled: true, intervalMin: 60, nextAt: null });
  });
});
