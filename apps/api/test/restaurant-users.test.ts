import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { PasswordService } from "../src/auth/password.service.js";
import { generateTemporaryPassword } from "../src/admin/temporary-password.js";
import { RestaurantUsersService } from "../src/admin/restaurant-users.service.js";
import { ActivityService } from "../src/admin/activity.service.js";
import { model, type Call } from "./helpers/fake-prisma.js";

const ACTOR = { id: "admin-1" };

function setup(users: Record<string, unknown>[] = [], liveLinks: { userId: string }[] = []) {
  const calls: Call[] = [];
  const sent: any[] = [];
  let mailWorks = true;
  const writes: { op: string; args: any }[] = [];
  const audits: any[] = [];
  const rows = users.map((u) => ({ isActive: true, ...u }));
  const prisma = {
    restaurant: { findUnique: async (a: any) => (a.where.id === "r1" || a.where.id === "r2" ? { id: a.where.id, name: "Chez Sam", slug: "chez-sam", locale: "fr" } : null) },
    accountToken: {
      findMany: async (a: any) => { calls.push({ model: "accountToken", op: "findMany", args: a }); return liveLinks; },
    },
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
  const invites = { sendLink: async (t: unknown) => { sent.push(t); return mailWorks ? { sent: true } : { sent: false, error: "no smtp" }; } };
  const svc = new RestaurantUsersService(prisma as never, new PasswordService(), audit as never, { assertReal: async () => undefined } as never, invites as never);
  return { svc, calls, writes, audits, sent, breakMail: () => { mailWorks = false; } };
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
  it("emails an invitation; nobody is shown or told a password, and the stored one is unusable", async () => {
    const { svc, writes, audits, sent } = setup();
    const out = await svc.create("r1", { email: "  New@Resto.TEST ", role: "MANAGER", fullName: " Sam " }, ACTOR);
    const stored = writes[0]!.args.data;
    assert.equal(stored.email, "new@resto.test");
    assert.equal(stored.restaurantId, "r1");
    assert.equal(stored.fullName, "Sam");
    assert.equal(stored.passwordSetAt, null);                      // still waiting to choose one
    assert.ok(stored.passwordHash.startsWith("$argon2"));          // a hash of something nobody knows
    assert.equal("temporaryPassword" in out, false);
    assert.equal(JSON.stringify(out).includes("passwordHash"), false);
    assert.equal(JSON.stringify(out.user).includes("passwordSetAt"), false);
    assert.deepEqual(out.invitation, { sent: true });
    assert.equal(sent.length, 1);
    assert.equal(sent[0].realm, "RESTAURANT");
    assert.equal(sent[0].kind, "INVITE");
    assert.equal(sent[0].user.email, "new@resto.test");
    assert.deepEqual(sent[0].restaurant, { id: "r1", name: "Chez Sam", slug: "chez-sam", locale: "fr" });
    assert.equal(audits[0].action, "restaurant_user.create");
    assert.equal(audits[0].restaurantId, "r1");
  });

  it("if the email cannot be sent the account still exists, and the answer says so", async () => {
    const m = setup(); m.breakMail();
    const out = await m.svc.create("r1", { email: "a@b.co", role: "STAFF" }, ACTOR);
    assert.equal(m.writes.filter((w) => w.op === "create").length, 1);
    assert.deepEqual(out.invitation, { sent: false, error: "no smtp" });
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
  const user = { id: "u1", restaurantId: "r1", email: "a@b.test", role: "OWNER", isActive: true, passwordSetAt: new Date() };

  it("cuts off the old password and every session at once, unlocks the account, and emails a link: no password is shown", async () => {
    const { svc, writes, audits, sent } = setup([user]);
    const out = await svc.resetPassword("r1", "u1", ACTOR);
    const w = writes[0]!;
    assert.deepEqual(w.args.where, { id: "u1", restaurantId: "r1" });
    assert.equal(w.args.data.failedLoginCount, 0);
    assert.equal(w.args.data.lockedUntil, null);
    assert.equal(w.args.data.passwordSetAt, null);
    assert.ok(w.args.data.passwordHash.startsWith("$argon2"));
    assert.equal(writes[1]!.op, "revokeSessions");
    assert.equal("temporaryPassword" in out, false);
    assert.deepEqual(out.invitation, { sent: true });
    assert.equal(sent[0].kind, "RESET");
    assert.equal(audits[0].action, "restaurant_user.password_reset");
  });

  it("a user of another restaurant cannot be reset through this one", async () => {
    const { svc, writes, sent } = setup([{ ...user, restaurantId: "r2" }]);
    await assert.rejects(svc.resetPassword("r1", "u1", ACTOR), NotFoundException);
    assert.equal(writes.length + sent.length, 0);
  });
});

describe("resending an invitation", () => {
  it("only for someone who has not chosen a password yet", async () => {
    const waiting = { id: "u1", restaurantId: "r1", email: "a@b.co", role: "STAFF", isActive: true, passwordSetAt: null };
    const a = setup([waiting]);
    assert.deepEqual((await a.svc.resendInvitation("r1", "u1", ACTOR)).invitation, { sent: true });
    assert.equal(a.sent[0].kind, "INVITE");
    assert.equal(a.audits[0].action, "restaurant_user.invite_resent");

    const b = setup([{ ...waiting, passwordSetAt: new Date() }]);
    await assert.rejects(b.svc.resendInvitation("r1", "u1", ACTOR), /already chosen a password/);
    assert.equal(b.sent.length, 0);
  });

  it("not for a user of another restaurant", async () => {
    const { svc, sent } = setup([{ id: "u1", restaurantId: "r2", email: "a@b.co", role: "STAFF", isActive: true, passwordSetAt: null }]);
    await assert.rejects(svc.resendInvitation("r1", "u1", ACTOR), NotFoundException);
    assert.equal(sent.length, 0);
  });
});

describe("listing", () => {
  it("never returns a password hash and stays inside the restaurant", async () => {
    const { svc, calls } = setup([{ id: "u1", restaurantId: "r1", email: "a@b.test", role: "OWNER", passwordSetAt: new Date() }]);
    await svc.list("r1");
    const call = calls.find((c) => c.op === "findMany" && c.model === "restaurantUser")!;
    assert.equal((call.args as any).where.restaurantId, "r1");
    assert.equal((call.args as any).select.passwordHash, undefined);
  });

  it("says who is still waiting to choose a password, and whether their link is still good", async () => {
    const base = { restaurantId: "r1", role: "STAFF", isActive: true };
    const { svc, calls } = setup(
      [{ ...base, id: "has", email: "a@b.co", passwordSetAt: new Date() }, { ...base, id: "waiting", email: "b@b.co", passwordSetAt: null }, { ...base, id: "lapsed", email: "c@b.co", passwordSetAt: null }],
      [{ userId: "waiting" }],
    );
    const list = await svc.list("r1");
    assert.deepEqual(list.map((u) => [u.id, u.invitation]), [["has", "none"], ["waiting", "pending"], ["lapsed", "expired"]]);
    assert.equal(JSON.stringify(list).includes("passwordSetAt"), false);
    const q = calls.find((c) => c.model === "accountToken")!.args as any;
    assert.equal(q.where.restaurantId, "r1");
    assert.equal(q.where.realm, "RESTAURANT");
    assert.deepEqual(q.where.userId.in.sort(), ["lapsed", "waiting"]);
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
