import assert from "node:assert/strict";
import { describe, it } from "node:test";
import "reflect-metadata";
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PasswordService } from "../src/auth/password.service.js";
import { PlatformUserDirectory, STANDING_TTL_MS } from "../src/auth/platform-user-directory.js";
import { AllowWhilePasswordChangeRequired } from "../src/auth/decorators/allow-while-password-change.decorator.js";
import { checkRemove, checkReset, checkTeamChange, type Member } from "../src/admin/team-rules.js";
import { TeamService } from "../src/admin/team.service.js";

Object.assign(process.env, {
  DATABASE_URL: "postgres://test", DIRECT_URL: "postgres://test", JWT_SECRET: "test-secret-".padEnd(40, "x"), ENCRYPTION_KEY: "0".repeat(64),
});
const { JwtAuthGuard, PASSWORD_CHANGE_REQUIRED } = await import("../src/auth/guards/jwt-auth.guard.js");
const { AuthService } = await import("../src/auth/auth.service.js");
const { ROLES_KEY } = await import("../src/auth/decorators/roles.decorator.js");
const { TeamController } = await import("../src/admin/team.controller.js");
const { AuthController } = await import("../src/auth/auth.controller.js");

const sa = (id: string, over: Partial<Member> = {}): Member => ({ id, role: "SUPER_ADMIN", isActive: true, ...over });

describe("what a platform admin may not do to the team", () => {
  it("cannot switch themselves off or change their own role, but can edit their own name", () => {
    assert.throws(() => checkTeamChange("a", sa("a"), { isActive: false }, 3), BadRequestException);
    assert.throws(() => checkTeamChange("a", sa("a"), { role: "SUPPORT" }, 3), BadRequestException);
    assert.doesNotThrow(() => checkTeamChange("a", sa("a"), {}, 3));
    assert.doesNotThrow(() => checkTeamChange("a", sa("a"), { isActive: true, role: "SUPER_ADMIN" }, 3));   // nothing really changes
  });

  it("can switch off or demote someone else while another super admin remains", () => {
    assert.doesNotThrow(() => checkTeamChange("a", sa("b"), { isActive: false }, 2));
    assert.doesNotThrow(() => checkTeamChange("a", sa("b"), { role: "SUPPORT" }, 2));
  });

  it("can never leave the platform without an active super admin", () => {
    assert.throws(() => checkTeamChange("x", sa("b"), { isActive: false }, 1), ConflictException);
    assert.throws(() => checkTeamChange("x", sa("b"), { role: "SUPPORT" }, 1), ConflictException);
  });

  it("support members and already-off accounts are not 'the last super admin'", () => {
    assert.doesNotThrow(() => checkTeamChange("a", { id: "s", role: "SUPPORT", isActive: true }, { isActive: false }, 1));
    assert.doesNotThrow(() => checkTeamChange("a", sa("b", { isActive: false }), { isActive: false }, 1));
  });

  it("cannot reset their own password (they use Change password, which asks for the current one)", () => {
    assert.throws(() => checkReset("a", "a"), BadRequestException);
    assert.doesNotThrow(() => checkReset("a", "b"));
  });
});

describe("deleting a team member for good", () => {
  it("never yourself, only after switching off, and never the last super admin", () => {
    assert.throws(() => checkRemove("a", sa("a", { isActive: false }), 2), /cannot delete yourself/);
    assert.throws(() => checkRemove("a", sa("b"), 2), /Switch them off first/);
    assert.throws(() => checkRemove("a", sa("b", { isActive: false }), 0), ConflictException);
    assert.doesNotThrow(() => checkRemove("a", sa("b", { isActive: false }), 1));
    assert.doesNotThrow(() => checkRemove("a", { id: "s", role: "SUPPORT", isActive: false }, 0));
  });
});

describe("TeamService", () => {
  function setup(users: any[], liveLinks: { userId: string }[] = []) {
    const writes: { op: string; args: any }[] = [];
    const audits: any[] = [];
    const invalidated: (string | undefined)[] = [];
    const sent: any[] = [];
    let mailWorks = true;
    const rows = users.map((u) => ({ isActive: true, mustChangePassword: false, role: "SUPPORT", ...u }));
    const prisma: any = {
      platformUser: {
        findMany: async (a: any) => { writes.push({ op: "findMany", args: a }); return rows; },
        findUnique: async (a: any) => rows.find((r) => (a.where.id ? r.id === a.where.id : r.email === a.where.email)) ?? null,
        count: async (a: any) => rows.filter((r) => r.role === a.where.role && r.isActive === a.where.isActive && r.id !== a.where.id?.not).length,
        create: async (a: any) => { writes.push({ op: "create", args: a }); return { id: "new", isActive: true, lastLoginAt: null, lockedUntil: null, createdAt: new Date(), ...a.data, passwordHash: undefined }; },
        update: (a: any) => ({ op: "update", args: a }),
        delete: (a: any) => ({ op: "deleteUser", args: a }),
      },
      platformSession: { updateMany: (a: any) => ({ op: "revokeSessions", args: a }) },
      accountToken: { findMany: async () => liveLinks, deleteMany: (a: any) => ({ op: "deleteTokens", args: a }) },
      auditLog: { findMany: async () => [{ id: "a1", createdAt: new Date(), actorId: "gone", action: "platform_user.create", entityId: "u1" }] },
      $transaction: async (ops: any[]) => { writes.push(...ops); return []; },
    };
    prisma.platformUser.findMany = async (a: any) => { writes.push({ op: "findMany", args: a }); return a?.where?.id ? rows.filter((r) => a.where.id.in.includes(r.id)) : rows; };
    const directory = { invalidate: (id?: string) => { invalidated.push(id); } };
    const invites = { sendLink: async (t: unknown) => { sent.push(t); return mailWorks ? { sent: true } : { sent: false, error: "no smtp" }; } };
    const svc = new TeamService(prisma, new PasswordService(), directory as never, { record: async (e: unknown) => { audits.push(e); } } as never, { assertReal: async () => undefined } as never, invites as never);
    return { svc, writes, audits, invalidated, sent, breakMail: () => { mailWorks = false; } };
  }
  const actor = { id: "admin" };

  it("lists people without ever selecting a password hash", async () => {
    const { svc, writes } = setup([{ id: "u1", email: "a@x.co" }]);
    await svc.list();
    assert.equal((writes[0]!.args as any).select.passwordHash, undefined);
  });

  it("a new member is emailed an invitation: no password is shown or known, and the stored one is unusable", async () => {
    const { svc, writes, audits, sent } = setup([]);
    const out = await svc.create({ email: " New@Team.CO ", role: "SUPPORT", fullName: " Sam " }, actor);
    const data = writes.find((w) => w.op === "create")!.args.data;
    assert.equal(data.email, "new@team.co");
    assert.equal(data.fullName, "Sam");
    assert.equal(data.passwordSetAt, null);
    assert.ok(data.passwordHash.startsWith("$argon2"));
    assert.equal("temporaryPassword" in out, false);
    assert.equal(JSON.stringify(out.user).includes("passwordHash"), false);
    assert.deepEqual(out.invitation, { sent: true });
    assert.deepEqual([sent[0].realm, sent[0].kind, sent[0].user.email], ["PLATFORM", "INVITE", "new@team.co"]);
    assert.equal(audits[0].action, "platform_user.create");
    assert.equal(audits[0].restaurantId, undefined);
  });

  it("if the email cannot be sent the account still exists, and the answer says so", async () => {
    const m = setup([]); m.breakMail();
    const out = await m.svc.create({ email: "a@b.co", role: "SUPPORT" }, actor);
    assert.equal(m.writes.filter((w) => w.op === "create").length, 1);
    assert.deepEqual(out.invitation, { sent: false, error: "no smtp" });
  });

  it("refuses an address that already has an account", async () => {
    const { svc, writes } = setup([{ id: "u1", email: "a@x.co" }]);
    await assert.rejects(svc.create({ email: "A@X.co", role: "SUPPORT" }, actor), ConflictException);
    assert.equal(writes.filter((w) => w.op === "create").length, 0);
  });

  it("switching someone off ends their sessions, drops the cached standing at once, and is audited", async () => {
    const { svc, writes, audits, invalidated } = setup([{ id: "admin", role: "SUPER_ADMIN", email: "me@x.co" }, { id: "u1", email: "a@x.co", role: "SUPPORT" }]);
    await svc.update("u1", { isActive: false }, actor);
    assert.deepEqual(writes.filter((w) => ["update", "revokeSessions"].includes(w.op)).map((w) => w.op), ["update", "revokeSessions"]);
    assert.equal(writes.find((w) => w.op === "revokeSessions")!.args.where.userId, "u1");
    assert.deepEqual(invalidated, ["u1"]);
    assert.equal(audits[0].action, "platform_user.deactivate");
  });

  it("applies the safety rules: not yourself, not the last super admin; an unknown member is not found", async () => {
    const { svc, writes } = setup([{ id: "admin", role: "SUPER_ADMIN", email: "me@x.co" }, { id: "b", role: "SUPER_ADMIN", email: "b@x.co" }]);
    await assert.rejects(svc.update("admin", { isActive: false }, actor), BadRequestException);
    await svc.update("b", { role: "SUPPORT" }, actor);                                   // another super admin (the actor) remains
    // exactly one active super admin left: nobody (even someone else) may switch them off or demote them
    const solo = setup([{ id: "b", role: "SUPER_ADMIN", email: "b@x.co" }, { id: "s", role: "SUPPORT", email: "s@x.co" }]);
    await assert.rejects(solo.svc.update("b", { isActive: false }, { id: "s" }), ConflictException);
    await assert.rejects(solo.svc.update("b", { role: "SUPPORT" }, { id: "s" }), ConflictException);
    await assert.rejects(svc.update("nope", { fullName: "x" }, actor), NotFoundException);
    assert.ok(writes.length > 0);
  });

  it("a reset cuts off the old password and every session at once, unlocks, and emails a link: no password is shown; your own account is refused", async () => {
    const { svc, writes, audits, invalidated, sent } = setup([{ id: "u1", email: "a@x.co", role: "SUPPORT" }]);
    const out = await svc.resetPassword("u1", actor);
    const upd = writes.find((w) => w.op === "update")!.args.data;
    assert.equal(upd.passwordSetAt, null);
    assert.equal(upd.failedLoginCount, 0);
    assert.equal(upd.lockedUntil, null);
    assert.ok(upd.passwordHash.startsWith("$argon2"));
    assert.ok(writes.some((w) => w.op === "revokeSessions"));
    assert.deepEqual(invalidated, ["u1"]);
    assert.equal("temporaryPassword" in out, false);
    assert.deepEqual(out.invitation, { sent: true });
    assert.equal(sent[0].kind, "RESET");
    assert.equal(audits[0].action, "platform_user.password_reset");
    await assert.rejects(svc.resetPassword("admin", { id: "admin" }), BadRequestException);
  });

  it("an invitation can be sent again, only to someone who has not chosen a password yet", async () => {
    const a = setup([{ id: "u1", email: "a@x.co", passwordSetAt: null }]);
    assert.deepEqual((await a.svc.resendInvitation("u1", actor)).invitation, { sent: true });
    assert.equal(a.sent[0].kind, "INVITE");
    assert.equal(a.audits[0].action, "platform_user.invite_resent");
    const b = setup([{ id: "u1", email: "a@x.co", passwordSetAt: new Date() }]);
    await assert.rejects(b.svc.resendInvitation("u1", actor), /already chosen a password/);
    await assert.rejects(b.svc.resendInvitation("nope", actor), NotFoundException);
  });

  it("the list says who is still waiting to choose a password, and whether their link is still good", async () => {
    const { svc } = setup([{ id: "has", email: "a@x.co", passwordSetAt: new Date() }, { id: "waiting", email: "b@x.co", passwordSetAt: null }, { id: "lapsed", email: "c@x.co", passwordSetAt: null }], [{ userId: "waiting" }]);
    const list = await svc.list();
    assert.deepEqual(list.map((u) => [u.id, u.invitation]), [["has", "none"], ["waiting", "pending"], ["lapsed", "expired"]]);
    assert.equal(JSON.stringify(list).includes("passwordSetAt"), false);
  });

  it("removing someone deletes their account and waiting links together, frees nothing else, and is audited with their address", async () => {
    const { svc, writes, audits, invalidated } = setup([{ id: "admin", role: "SUPER_ADMIN", email: "me@x.co" }, { id: "u1", role: "SUPPORT", email: "gone@x.co", isActive: false }]);
    assert.deepEqual(await svc.remove("u1", actor), { removed: true });
    assert.deepEqual(writes.filter((w) => ["deleteTokens", "deleteUser"].includes(w.op)).map((w) => w.op), ["deleteTokens", "deleteUser"]);
    assert.deepEqual(writes.find((w) => w.op === "deleteTokens")!.args.where, { realm: "PLATFORM", userId: "u1" });
    assert.deepEqual(writes.find((w) => w.op === "deleteUser")!.args.where, { id: "u1" });
    assert.deepEqual(invalidated, ["u1"]);
    assert.equal(audits[0].action, "platform_user.delete");
    assert.deepEqual(audits[0].before, { email: "gone@x.co", role: "SUPPORT" });
  });

  it("refuses someone who is still switched on, yourself, the last super admin and an unknown member, writing nothing", async () => {
    const { svc, writes } = setup([{ id: "admin", role: "SUPER_ADMIN", email: "me@x.co" }, { id: "on", role: "SUPPORT", email: "on@x.co", isActive: true }, { id: "lone", role: "SUPER_ADMIN", email: "lone@x.co", isActive: false }]);
    await assert.rejects(svc.remove("on", actor), /Switch them off first/);
    await assert.rejects(svc.remove("admin", actor), BadRequestException);
    await assert.rejects(svc.remove("nope", actor), NotFoundException);
    // actor is not in the table as an active super admin: the one switched-off super admin would be the last
    const solo = setup([{ id: "lone", role: "SUPER_ADMIN", email: "lone@x.co", isActive: false }]);
    await assert.rejects(solo.svc.remove("lone", { id: "someone" }), ConflictException);
    assert.equal([...writes, ...solo.writes].filter((w) => ["deleteTokens", "deleteUser"].includes(w.op)).length, 0);
  });

  it("the team's activity still names a deleted person, from the address the history kept", async () => {
    const { svc } = setup([{ id: "u1", email: "still@x.co" }]);
    (svc as any).prisma.auditLog.findMany = async () => [{ id: "a1", createdAt: new Date(), actorId: "u1", action: "platform_user.delete", entityId: "gone-id", before: { email: "gone@x.co", role: "SUPPORT" } }];
    const [a] = await svc.activity();
    assert.equal(a!.target, "gone@x.co");
    (svc as any).prisma.auditLog.findMany = async () => [{ id: "a2", createdAt: new Date(), actorId: "u1", action: "platform_user.create", entityId: "gone-id", before: null, after: { email: "gone@x.co", role: "SUPPORT" } }];
    assert.equal((await svc.activity())[0]!.target, "gone@x.co");   // even the entry from when they were created
  });

  it("the team's activity names who did what, even for someone since removed", async () => {
    const { svc } = setup([{ id: "u1", email: "target@x.co" }]);
    const [a] = await svc.activity();
    assert.equal(a!.target, "target@x.co");
    assert.match(a!.actor, /removed/);
  });
});

describe("the guard asks who someone is NOW, not who the token says they were", () => {
  const handler = function handler() {};
  const ctxFor = (headers: Record<string, string>, allowed = false) => {
    const req: any = { headers };
    if (allowed) AllowWhilePasswordChangeRequired()(handler as never, undefined as never, { value: handler } as never);
    return { req, ctx: { switchToHttp: () => ({ getRequest: () => req }), getHandler: () => handler, getClass: () => class {} } as never };
  };
  const make = (standing: any, role = "SUPER_ADMIN") => {
    let lookups = 0;
    const tokens = { verifyAccessToken: async (t: string) => { if (t !== "good") throw new Error("bad"); return { type: "platform", sub: "u1", role }; } };
    const directory = { standing: async () => { lookups++; return standing; } };
    return { guard: new JwtAuthGuard(tokens as never, directory as never, new Reflector()), lookups: () => lookups };
  };
  const status = (e: unknown) => (e as { getStatus?: () => number }).getStatus?.();

  it("no token, a bad token, an account that is switched off or gone: all refused with 401", async () => {
    await assert.rejects(make({ isActive: true, role: "SUPPORT", mustChangePassword: false }).guard.canActivate(ctxFor({}).ctx), UnauthorizedException);
    await assert.rejects(make({ isActive: true, role: "SUPPORT", mustChangePassword: false }).guard.canActivate(ctxFor({ authorization: "Bearer evil" }).ctx), UnauthorizedException);
    await assert.rejects(make({ isActive: false, role: "SUPPORT", mustChangePassword: false }).guard.canActivate(ctxFor({ authorization: "Bearer good" }).ctx), (e) => status(e) === 401);
    await assert.rejects(make(null).guard.canActivate(ctxFor({ authorization: "Bearer good" }).ctx), (e) => status(e) === 401);
  });

  it("uses the role they have now: a token that says SUPER_ADMIN for someone since demoted is only SUPPORT", async () => {
    const { req, ctx } = ctxFor({ authorization: "Bearer good" });
    await make({ isActive: true, role: "SUPPORT", mustChangePassword: false }, "SUPER_ADMIN").guard.canActivate(ctx);
    assert.equal(req.user.role, "SUPPORT");
  });

  it("someone who must choose a new password can do nothing else, with a code the screen recognises", async () => {
    const { guard } = make({ isActive: true, role: "SUPER_ADMIN", mustChangePassword: true });
    await assert.rejects(guard.canActivate(ctxFor({ authorization: "Bearer good" }).ctx), (e) => {
      assert.ok(e instanceof ForbiddenException);
      assert.equal((e.getResponse() as any).code, PASSWORD_CHANGE_REQUIRED);
      return true;
    });
  });

  it("except the routes marked for exactly that (change password, who am I)", async () => {
    const { guard } = make({ isActive: true, role: "SUPER_ADMIN", mustChangePassword: true });
    const { ctx } = ctxFor({ authorization: "Bearer good" }, true);
    assert.equal(await guard.canActivate(ctx), true);
  });
});

describe("the standing cache", () => {
  it("is short: a switched-off or demoted person is stopped within seconds, never minutes (even on another server)", () => {
    assert.ok(STANDING_TTL_MS <= 30_000, `the cache holds an answer for ${STANDING_TTL_MS} ms`);
  });

  it("answers from memory for a few seconds, then looks again, and forgets at once when told", async () => {
    let lookups = 0;
    const prisma = { platformUser: { findUnique: async () => { lookups++; return { isActive: true, role: "SUPPORT", mustChangePassword: false }; } } };
    const dir = new PlatformUserDirectory(prisma as never);
    const t0 = 1_000_000;
    await dir.standing("u1", t0); await dir.standing("u1", t0 + STANDING_TTL_MS - 1);
    assert.equal(lookups, 1);
    await dir.standing("u1", t0 + STANDING_TTL_MS + 1);
    assert.equal(lookups, 2);
    dir.invalidate("u1");
    await dir.standing("u1", t0 + STANDING_TTL_MS + 2);
    assert.equal(lookups, 3);
  });
  it("a person who does not exist is cached too, so a deleted account costs nothing to refuse again", async () => {
    let lookups = 0;
    const dir = new PlatformUserDirectory({ platformUser: { findUnique: async () => { lookups++; return null; } } } as never);
    assert.equal(await dir.standing("ghost", 1), null);
    assert.equal(await dir.standing("ghost", 2), null);
    assert.equal(lookups, 1);
  });
});

describe("changing your own password", () => {
  async function setup(over: Record<string, unknown> = {}) {
    const passwords = new PasswordService();
    const user: any = { id: "u1", isActive: true, failedLoginCount: 0, lockedUntil: null, passwordHash: await passwords.hash("the-old-password-123"), ...over };
    const writes: { op: string; args: any }[] = [];
    const audits: any[] = [];
    const invalidated: string[] = [];
    const prisma: any = {
      platformUser: { findUnique: async () => user, update: (a: any) => { writes.push({ op: "userUpdate", args: a }); return { op: "userUpdate", args: a }; } },
      platformSession: { updateMany: (a: any) => ({ op: "sessions", args: a }) },
      $transaction: async (ops: any[]) => { writes.push(...ops); return []; },
    };
    const tokens = { hashRefreshToken: (t: string) => `hash(${t})` };
    const svc = new AuthService(prisma, passwords, tokens as never, { invalidate: (id: string) => invalidated.push(id) } as never, { record: async (e: unknown) => { audits.push(e); } } as never);
    return { svc, writes, audits, invalidated, passwords, user };
  }

  it("with the right current password: sets the new one, clears the 'must change' flag, ends the OTHER sessions, keeps this one", async () => {
    const { svc, writes, audits, invalidated, passwords } = await setup({ mustChangePassword: true });
    await svc.changePassword("u1", "the-old-password-123", "a-brand-new-password-9", "my-cookie");
    const upd = writes.find((w) => w.op === "userUpdate" && w.args.data.passwordHash)!.args.data;
    assert.equal(upd.mustChangePassword, false);
    assert.ok(await passwords.verify(upd.passwordHash, "a-brand-new-password-9"));
    const sessions = writes.find((w) => w.op === "sessions")!.args;
    assert.deepEqual(sessions.where, { userId: "u1", revokedAt: null, NOT: { tokenHash: "hash(my-cookie)" } });
    assert.deepEqual(invalidated, ["u1"]);
    assert.equal(audits[0].action, "platform_user.password_change");
    assert.equal(JSON.stringify(audits).includes("a-brand-new-password-9"), false);
  });

  it("with no session cookie to keep, every session ends", async () => {
    const { svc, writes } = await setup();
    await svc.changePassword("u1", "the-old-password-123", "a-brand-new-password-9", undefined);
    assert.deepEqual(writes.find((w) => w.op === "sessions")!.args.where, { userId: "u1", revokedAt: null });
  });

  it("a wrong current password is refused and counts towards the lock-out, and nothing changes", async () => {
    const { svc, writes } = await setup({ failedLoginCount: 4 });
    await assert.rejects(svc.changePassword("u1", "not-it-at-all-12345", "a-brand-new-password-9", "c"), /current password is not right/);
    const upd = writes.find((w) => w.op === "userUpdate")!.args.data;
    assert.equal(upd.failedLoginCount, 5);
    assert.ok(upd.lockedUntil instanceof Date);
    assert.equal(writes.some((w) => w.op === "sessions"), false);
  });

  it("a locked account cannot try at all", async () => {
    const { svc } = await setup({ lockedUntil: new Date(Date.now() + 60_000) });
    await assert.rejects(svc.changePassword("u1", "the-old-password-123", "a-brand-new-password-9", "c"), /Too many wrong attempts/);
  });

  it("the new password must differ from the old one; a switched-off account cannot", async () => {
    await assert.rejects((await setup()).svc.changePassword("u1", "the-old-password-123", "the-old-password-123", "c"), /must be different/);
    await assert.rejects((await setup({ isActive: false })).svc.changePassword("u1", "the-old-password-123", "a-brand-new-password-9", "c"), UnauthorizedException);
  });
});

describe("who may reach what", () => {
  it("the whole team screen is SUPER_ADMIN only, reading included, deleting too", () => {
    assert.deepEqual(Reflect.getMetadata(ROLES_KEY, TeamController), ["SUPER_ADMIN"]);
  });
  it("only change-password and who-am-I are open to someone who has not chosen a password yet", () => {
    const proto = (AuthController as never as { prototype: Record<string, object> }).prototype;
    for (const name of ["changePassword", "me"]) assert.equal(Reflect.getMetadata("allowWhilePasswordChangeRequired", proto[name]!), true, name);
  });
});
