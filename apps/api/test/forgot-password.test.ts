import assert from "node:assert/strict";
import { describe, it } from "node:test";
import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { AccountInviteService, FORGOT_COOLDOWN_MS } from "../src/auth/account-invites.service.js";
import { PasswordService } from "../src/auth/password.service.js";
import { ForgotPasswordDto, RestaurantForgotPasswordDto } from "../src/auth/dto/forgot-password.dto.js";
import { explainMailError } from "../src/common/mail-errors.js";
import { inviteEmail } from "../src/common/mail-templates.js";

const NOW = Date.parse("2026-10-01T12:00:00Z");

function setup(opts: { platformUser?: any; restaurant?: any; restaurantUser?: any; recentToken?: boolean; sendFails?: boolean } = {}) {
  const calls: { fn: string; args: any }[] = [];
  const sent: any[] = [];
  const issued: any[] = [];
  const audits: any[] = [];
  const prisma: any = {
    platformUser: {
      findUnique: async (a: any) => { calls.push({ fn: "platformUser.findUnique", args: a }); return opts.platformUser && opts.platformUser.email === a.where.email ? opts.platformUser : null; },
      update: async (a: any) => { calls.push({ fn: "platformUser.update", args: a }); },
    },
    restaurant: { findUnique: async (a: any) => { calls.push({ fn: "restaurant.findUnique", args: a }); return opts.restaurant && opts.restaurant.slug === a.where.slug ? opts.restaurant : null; } },
    restaurantUser: {
      findFirst: async (a: any) => { calls.push({ fn: "restaurantUser.findFirst", args: a }); return opts.restaurantUser && opts.restaurantUser.email === a.where.email && a.where.restaurantId === opts.restaurant?.id ? opts.restaurantUser : null; },
      updateMany: async (a: any) => { calls.push({ fn: "restaurantUser.updateMany", args: a }); },
    },
    accountToken: { findFirst: async (a: any) => { calls.push({ fn: "accountToken.findFirst", args: a }); return opts.recentToken ? { id: "recent" } : null; } },
  };
  const tokens: any = { issue: async (a: any) => { issued.push(a); return { token: "TOKEN-VALUE-1234567890-abcdefghijkl", expiresAt: new Date() }; } };
  const mailer: any = { send: async (m: any) => { if (opts.sendFails) throw new Error("smtp down"); sent.push(m); } };
  const svc = new AccountInviteService(prisma, tokens, mailer, new PasswordService(), { invalidate: () => undefined } as never, { record: async (e: unknown) => { audits.push(e); } } as never);
  return { svc, calls, sent, issued, audits };
}

const sam = { id: "u1", email: "sam@chez.co", fullName: "Sam", isActive: true, passwordSetAt: new Date() };
const resto = { id: "r1", name: "Chez Sam", slug: "chez-sam", locale: "fr", status: "ACTIVE" };

describe("Forgot password: platform", () => {
  it("emails a reset link to someone who has an account, and says their current password still works", async () => {
    const { svc, sent, issued, audits } = setup({ platformUser: sam });
    await svc.requestReset("PLATFORM", "  Sam@Chez.CO ", undefined, true, NOW);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, "sam@chez.co");
    assert.equal(sent[0].subject, "Reset your password for the Kiosk platform admin");
    assert.match(sent[0].text, /current password keeps working/);
    assert.deepEqual(issued[0], { realm: "PLATFORM", kind: "RESET", userId: "u1", restaurantId: undefined });
    assert.equal(audits[0].action, "platform_user.password_forgot_requested");
  });

  it("never touches the person's password or sessions: asking for a link cannot lock anyone out", async () => {
    const { svc, calls } = setup({ platformUser: sam });
    await svc.requestReset("PLATFORM", "sam@chez.co", undefined, true, NOW);
    assert.equal(calls.some((c) => /update/.test(c.fn)), false);
  });

  it("an address with no account: nothing is sent, nothing is stored, and no error", async () => {
    const { svc, sent, issued, audits } = setup({ platformUser: sam });
    await assert.doesNotReject(svc.requestReset("PLATFORM", "nobody@chez.co", undefined, true, NOW));
    assert.deepEqual([sent.length, issued.length, audits.length], [0, 0, 0]);
  });

  it("a switched-off account gets nothing", async () => {
    const { svc, sent } = setup({ platformUser: { ...sam, isActive: false } });
    await svc.requestReset("PLATFORM", "sam@chez.co", undefined, true, NOW);
    assert.equal(sent.length, 0);
  });

  it("someone who never chose a password is sent a fresh invitation instead of a reset", async () => {
    const { svc, sent, issued } = setup({ platformUser: { ...sam, passwordSetAt: null } });
    await svc.requestReset("PLATFORM", "sam@chez.co", undefined, true, NOW);
    assert.equal(issued[0].kind, "INVITE");
    assert.equal(sent[0].subject, "You have been invited to the Kiosk platform admin");
  });

  it("a second request within two minutes is quietly ignored (no flooding someone's inbox)", async () => {
    const { svc, sent, calls } = setup({ platformUser: sam, recentToken: true });
    await svc.requestReset("PLATFORM", "sam@chez.co", undefined, true, NOW);
    assert.equal(sent.length, 0);
    const q = calls.find((c) => c.fn === "accountToken.findFirst")!.args;
    assert.equal(q.where.createdAt.gt.getTime(), NOW - FORGOT_COOLDOWN_MS);
    assert.equal(q.where.userId, "u1");
    assert.equal(q.where.usedAt, null);   // only a link that is still waiting counts: one already used does not block a new request
    assert.equal(FORGOT_COOLDOWN_MS, 120_000);
  });

  it("a failing mail server never makes the request fail or leak: the answer is the same", async () => {
    const { svc } = setup({ platformUser: sam, sendFails: true });
    await assert.doesNotReject(svc.requestReset("PLATFORM", "sam@chez.co", undefined, true, NOW));
  });

  it("the answer does not wait for the email: it returns before the (slow) sending is done", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const s = setup({ platformUser: sam });
    (s.svc as any).mailer.send = async (m: any) => { await gate; s.sent.push(m); };
    // Must come back while the email is still stuck. If it waits for the email it would wait forever, so give it a second.
    const answered = await Promise.race([
      s.svc.requestReset("PLATFORM", "sam@chez.co", undefined, false, NOW).then(() => true),
      new Promise<boolean>((r) => setTimeout(() => r(false), 1000)),
    ]);
    assert.equal(answered, true, "the answer waited for the email to be sent");
    assert.equal(s.sent.length, 0);
    release();
    await new Promise((r) => setImmediate(r)); await new Promise((r) => setImmediate(r));
    assert.equal(s.sent.length, 1);
  });
});

describe("Forgot password: restaurant", () => {
  it("emails the right person in the restaurant's language, with the restaurant in every query", async () => {
    const { svc, sent, issued, calls, audits } = setup({ restaurant: resto, restaurantUser: sam });
    await svc.requestReset("RESTAURANT", "sam@chez.co", "chez-sam", true, NOW);
    assert.equal(sent[0].subject, "Réinitialisez votre mot de passe pour Chez Sam");
    assert.match(sent[0].text, /continue de fonctionner/);
    assert.deepEqual(issued[0], { realm: "RESTAURANT", kind: "RESET", userId: "u1", restaurantId: "r1" });
    assert.equal(calls.find((c) => c.fn === "restaurantUser.findFirst")!.args.where.restaurantId, "r1");
    assert.equal(audits[0].restaurantId, "r1");
    assert.equal(audits[0].action, "restaurant_user.password_forgot_requested");
  });

  it("the same address at another restaurant is a different account: asking at the wrong restaurant sends nothing", async () => {
    const { svc, sent } = setup({ restaurant: resto, restaurantUser: sam });
    await svc.requestReset("RESTAURANT", "sam@chez.co", "other-place", true, NOW);
    assert.equal(sent.length, 0);
  });

  it("an unknown restaurant, a suspended one, a missing address or an unknown person: nothing, and no error", async () => {
    for (const opts of [{}, { restaurant: { ...resto, status: "SUSPENDED" }, restaurantUser: sam }, { restaurant: resto }, { restaurant: resto, restaurantUser: { ...sam, isActive: false } }]) {
      const { svc, sent } = setup(opts);
      await assert.doesNotReject(svc.requestReset("RESTAURANT", "sam@chez.co", "chez-sam", true, NOW));
      assert.equal(sent.length, 0);
    }
    const { svc, sent } = setup({ restaurant: resto, restaurantUser: sam });
    await svc.requestReset("RESTAURANT", "sam@chez.co", undefined, true, NOW);   // no restaurant given at all
    assert.equal(sent.length, 0);
  });
});

describe("the emails", () => {
  const base = { service: "Chez Sam", link: "https://x.test/accept-invite?token=t", hours: 24 };
  it("'forgot' says the current password keeps working and to ignore it if you did not ask, in both languages", () => {
    const en = inviteEmail({ ...base, locale: "en", kind: "FORGOT" });
    assert.equal(en.subject, "Reset your password for Chez Sam");
    assert.match(en.text, /keeps working until you choose a new one/);
    assert.match(en.text, /did not ask for this/);
    assert.equal(/old password no longer works/.test(en.text), false);
    const fr = inviteEmail({ ...base, locale: "fr", kind: "FORGOT" });
    assert.match(fr.text, /Si vous n'êtes pas à l'origine de cette demande/);
  });
  it("the platform's own reset still says the old password no longer works", () => {
    assert.match(inviteEmail({ ...base, locale: "en", kind: "RESET" }).text, /old password no longer works/);
  });
});

describe("the request forms", () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const ok = (t: new () => object, v: unknown) => pipe.transform(v, { type: "body", metatype: t });
  it("need a real-looking address, and the restaurant address for a restaurant; nothing extra", async () => {
    await ok(ForgotPasswordDto, { email: "a@b.co" });
    await ok(RestaurantForgotPasswordDto, { email: "a@b.co", slug: "chez-sam" });
    for (const bad of [{ email: "nope" }, {}, { email: "a@b.co", admin: true }]) await assert.rejects(ok(ForgotPasswordDto, bad));
    for (const bad of [{ email: "a@b.co" }, { email: "a@b.co", slug: "Bad Slug" }]) await assert.rejects(ok(RestaurantForgotPasswordDto, bad));
  });
  it("are public: no sign-in is needed to ask", async () => {
    Object.assign(process.env, { DATABASE_URL: "postgres://test", DIRECT_URL: "postgres://test", JWT_SECRET: "test-secret-".padEnd(40, "x"), ENCRYPTION_KEY: "0".repeat(64) });
    const { AuthController } = await import("../src/auth/auth.controller.js");
    const { RestaurantAuthController } = await import("../src/restaurant-auth/restaurant-auth.controller.js");
    for (const ctl of [AuthController, RestaurantAuthController]) {
      const fn = (ctl as never as { prototype: Record<string, object> }).prototype.forgotPassword!;
      assert.equal(typeof fn, "function", ctl.name);
      assert.equal(Reflect.getMetadata("__guards__", fn), undefined, `${ctl.name}.forgotPassword is public`);
    }
  });
});

describe("explaining mail errors in plain words", () => {
  const env = { SMTP_HOST: "smtp.gmail.com", SMTP_PORT: "587" };
  const cases: [string, unknown, RegExp][] = [
    ["wrong password", { code: "EAUTH", responseCode: 535, message: "Invalid login" }, /App password/],
    ["resend wording", { responseCode: 535 }, /"resend"/],
    ["host does not exist", { code: "ENOTFOUND", message: "getaddrinfo ENOTFOUND smtp.gmial.com" }, /does not exist.*typo/],
    ["connection refused", { code: "ECONNREFUSED" }, /refused the connection on port 587/],
    ["timeout", { code: "ETIMEDOUT" }, /firewall.*port 25/],
    ["tls mismatch", { code: "ESOCKET", message: "error:0A00010B:SSL routines::wrong version number" }, /465 needs SMTP_SECURE=true/],
    ["sender rejected", { responseCode: 553, message: "sender not allowed" }, /MAIL_FROM/],
    ["something unknown", { message: "weird" }, /could not be sent: weird/],
  ];
  for (const [name, err, expected] of cases) it(name, () => assert.match(explainMailError(err, env), expected));
  it("names the actual server", () => assert.match(explainMailError({ code: "EAUTH" }, { SMTP_HOST: "smtp.resend.com" }), /smtp\.resend\.com refused/));
  it("never throws, whatever it is given", () => { for (const v of [undefined, null, "text", 42, {}]) assert.equal(typeof explainMailError(v, env), "string"); });
});
