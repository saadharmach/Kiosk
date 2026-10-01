import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { PasswordService } from "../src/auth/password.service.js";
import { generateTemporaryPassword } from "../src/admin/temporary-password.js";
import { RestaurantUsersService } from "../src/admin/restaurant-users.service.js";
import { ActivityService } from "../src/admin/activity.service.js";
import { model, type Call } from "./helpers/fake-prisma.js";

const ACTOR = { id: "admin-1" };

function setup(users: Record<string, unknown>[] = []) {
  const calls: Call[] = [];
  const writes: { op: string; args: any }[] = [];
  const audits: any[] = [];
  const rows = users.map((u) => ({ isActive: true, ...u }));
  const prisma = {
    restaurant: { findUnique: async (a: any) => (a.where.id === "r1" || a.where.id === "r2" ? { id: a.where.id } : null) },
    restaurantUser: {
      ...model(rows, calls, "restaurantUser"),
      create: async (a: any) => {
        writes.push({ op: "create", args: a });
        return { id: "new-user", isActive: true, lastLoginAt: null, lockedUntil: null, createdAt: new Date(), ...a.data, passwordHash: undefined };
      },
      updateMany: (a: any) => ({ op: "updateMany", args: a }),
    },
    restaurantSession: { updateMany: (a: any) => ({ op: "revokeSessions", args: a }) },
    $transaction: async (ops: { op: string; args: any }[]) => { writes.push(...ops); return []; },
  };
  const audit = { record: async (e: unknown) => { audits.push(e); } };
  const svc = new RestaurantUsersService(prisma as never, new PasswordService(), audit as never);
  return { svc, calls, writes, audits };
}

describe("temporary passwords", () => {
  it("are 16 random characters without look-alike letters", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const p = generateTemporaryPassword();
      assert.match(p, /^[abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789]{16}$/);
      seen.add(p);
    }
    assert.equal(seen.size, 200);
  });
});

describe("creating a restaurant user", () => {
  it("returns the password once, stores only a hash that checks out, and never audits it", async () => {
    const { svc, writes, audits } = setup();
    const out = await svc.create("r1", { email: "  New@Resto.TEST ", role: "MANAGER", fullName: " Sam " }, ACTOR);
    const stored = writes[0]!.args.data;
    assert.equal(stored.email, "new@resto.test");
    assert.equal(stored.restaurantId, "r1");
    assert.equal(stored.fullName, "Sam");
    assert.notEqual(stored.passwordHash, out.temporaryPassword);
    assert.ok(await new PasswordService().verify(stored.passwordHash, out.temporaryPassword));
    assert.equal(JSON.stringify(out.user).includes("passwordHash"), false);
    assert.equal(JSON.stringify(audits).includes(out.temporaryPassword), false);
    assert.equal(audits[0].action, "restaurant_user.create");
    assert.equal(audits[0].restaurantId, "r1");
  });

  it("refuses an address that already has an account there (any capitalisation)", async () => {
    const { svc, writes } = setup([{ id: "u1", restaurantId: "r1", email: "a@b.test" }]);
    await assert.rejects(svc.create("r1", { email: "A@B.test", role: "STAFF" }, ACTOR), ConflictException);
    assert.equal(writes.length, 0);
  });

  it("allows the same address at another restaurant", async () => {
    const { svc } = setup([{ id: "u1", restaurantId: "r2", email: "a@b.test" }]);
    await svc.create("r1", { email: "a@b.test", role: "STAFF" }, ACTOR);
  });

  it("refuses an unknown restaurant", async () => {
    const { svc } = setup();
    await assert.rejects(svc.create("nope", { email: "a@b.test", role: "STAFF" }, ACTOR), NotFoundException);
  });
});

describe("changing a restaurant user", () => {
  const user = { id: "u1", restaurantId: "r1", email: "a@b.test", role: "MANAGER", isActive: true, fullName: null };

  it("scopes the write by restaurant, and switching someone off ends their sessions", async () => {
    const { svc, writes, audits } = setup([user]);
    await svc.update("r1", "u1", { isActive: false }, ACTOR);
    assert.deepEqual(writes.map((w) => w.op), ["updateMany", "revokeSessions"]);
    assert.deepEqual(writes[0]!.args.where, { id: "u1", restaurantId: "r1" });
    assert.deepEqual(writes[1]!.args.where.restaurantId, "r1");
    assert.equal(writes[1]!.args.where.userId, "u1");
    assert.equal(audits[0].action, "restaurant_user.deactivate");
  });

  it("a user of another restaurant cannot be reached through this one, and nothing is written", async () => {
    const { svc, writes } = setup([{ ...user, restaurantId: "r2" }]);
    await assert.rejects(svc.update("r1", "u1", { isActive: false }, ACTOR), NotFoundException);
    await assert.rejects(svc.resetPassword("r1", "u1", ACTOR), NotFoundException);
    assert.equal(writes.length, 0);
  });

  it("only touches the fields that were sent", async () => {
    const { svc, writes } = setup([user]);
    await svc.update("r1", "u1", { role: "OWNER" }, ACTOR);
    assert.deepEqual(writes[0]!.args.data, { role: "OWNER" });
    assert.equal(writes.length, 1);
  });
});

describe("resetting a password", () => {
  it("replaces the hash, unlocks the account, ends every session, and shows the new password only in the reply", async () => {
    const { svc, writes, audits } = setup([{ id: "u1", restaurantId: "r1", email: "a@b.test", role: "OWNER", isActive: true }]);
    const out = await svc.resetPassword("r1", "u1", ACTOR);
    const w = writes[0]!;
    assert.deepEqual(w.args.where, { id: "u1", restaurantId: "r1" });
    assert.equal(w.args.data.failedLoginCount, 0);
    assert.equal(w.args.data.lockedUntil, null);
    assert.ok(await new PasswordService().verify(w.args.data.passwordHash, out.temporaryPassword));
    assert.equal(writes[1]!.op, "revokeSessions");
    assert.equal(JSON.stringify(audits).includes(out.temporaryPassword), false);
    assert.equal(audits[0].action, "restaurant_user.password_reset");
  });
});

describe("listing", () => {
  it("never returns a password hash and stays inside the restaurant", async () => {
    const { svc, calls } = setup([{ id: "u1", restaurantId: "r1", email: "a@b.test", role: "OWNER" }]);
    await svc.list("r1");
    const call = calls.find((c) => c.op === "findMany")!;
    assert.equal((call.args as any).where.restaurantId, "r1");
    assert.equal((call.args as any).select.passwordHash, undefined);
  });
});

describe("the restaurant's activity log", () => {
  it("names who did it, leaves out the before/after data, and stays inside the restaurant", async () => {
    const calls: Call[] = [];
    const log = [
      { id: "a1", createdAt: new Date(2026, 9, 1), actorType: "PLATFORM_USER", actorId: "admin-1", actorLabel: null, action: "restaurant.update", entityType: "Restaurant", entityId: "r1" },
      { id: "a2", createdAt: new Date(2026, 9, 2), actorType: "RESTAURANT_USER", actorId: "u1", actorLabel: null, action: "order.cancel", entityType: "Order", entityId: "o1" },
      { id: "a3", createdAt: new Date(2026, 9, 3), actorType: "SYSTEM", actorId: null, actorLabel: null, action: "sync.run", entityType: "Sync", entityId: null },
    ];
    const prisma = {
      auditLog: { count: async () => 3, findMany: async (a: unknown) => { calls.push({ model: "auditLog", op: "findMany", args: a }); return log; } },
      platformUser: model([{ id: "admin-1", email: "boss@platform.test" }], calls, "platformUser"),
      restaurantUser: model([{ id: "u1", restaurantId: "r1", email: "owner@resto.test" }], calls, "restaurantUser"),
    };
    const out = await new ActivityService(prisma as never).list("r1");
    assert.deepEqual(out.items.map((i) => i.actor), ["boss@platform.test", "owner@resto.test", "System"]);
    assert.equal(JSON.stringify(out).includes("before"), false);
    const q = calls.find((c) => c.model === "auditLog")!.args as any;
    assert.equal(q.where.restaurantId, "r1");
    assert.equal(q.select.before, undefined);
    assert.equal(q.select.after, undefined);
  });
});
