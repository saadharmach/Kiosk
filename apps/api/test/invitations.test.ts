import assert from "node:assert/strict";
import { describe, it } from "node:test";
import "reflect-metadata";
import { createHash } from "node:crypto";
import { BadRequestException } from "@nestjs/common";
import { SMTPServer } from "smtp-server";
import { AccountInviteService } from "../src/auth/account-invites.service.js";
import { PasswordService } from "../src/auth/password.service.js";
import { AccountTokenService, TTL_HOURS, hashToken } from "../src/common/account-tokens.service.js";
import { inviteEmail, mailLocale } from "../src/common/mail-templates.js";
import { MailNotConfiguredError, MailerService } from "../src/common/mailer.service.js";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

describe("the emails", () => {
  const base = { service: "Chez Sam", link: "https://app.test/accept-invite?token=abc", hours: 72 };

  it("an invitation in English: says who it is for, carries the link in text and html, and when it expires", () => {
    const m = inviteEmail({ ...base, locale: "en", kind: "INVITE", name: "Sam" });
    assert.equal(m.subject, "You have been invited to Chez Sam");
    for (const part of [m.text, m.html]) { assert.ok(part.includes(base.link)); assert.ok(part.includes("72 hours")); }
    assert.ok(m.text.startsWith("Hello Sam,"));
  });

  it("in French for a restaurant that works in French", () => {
    const m = inviteEmail({ ...base, locale: "fr", kind: "INVITE" });
    assert.equal(m.subject, "Vous êtes invité(e) sur Chez Sam");
    assert.ok(m.text.startsWith("Bonjour,"));
    assert.ok(m.text.includes("72 heures"));
  });

  it("a reset says the old password no longer works", () => {
    const m = inviteEmail({ ...base, locale: "en", kind: "RESET", hours: 24 });
    assert.equal(m.subject, "Choose a new password for Chez Sam");
    assert.match(m.text, /old password no longer works/);
    assert.ok(m.text.includes("24 hours"));
  });

  it("nothing a person typed can inject markup into the html", () => {
    const m = inviteEmail({ ...base, locale: "en", kind: "INVITE", name: '<img src=x onerror="steal()">', service: "A & B <script>" });
    assert.equal(m.html.includes("<img"), false);
    assert.equal(m.html.includes("<script>"), false);
    assert.ok(m.html.includes("&lt;img"));
  });

  it("French for French or anything unknown (Arabic included for now), English only when the restaurant says so", () => {
    assert.deepEqual([mailLocale("fr"), mailLocale("en"), mailLocale("ar"), mailLocale(null)], ["fr", "en", "fr", "fr"]);
  });
});

describe("the mailer", () => {
  it("with no SMTP on a development machine, writes mail to the log and keeps it in the outbox", async () => {
    const m = new MailerService({});
    assert.equal(m.mode, "log");
    await m.send({ to: "a@b.co", subject: "Hi", text: "link", html: "<p>link</p>" });
    assert.equal(m.outbox.length, 1);
    assert.equal(m.outbox[0]!.to, "a@b.co");
  });

  it("the outbox keeps only the last few messages", async () => {
    const m = new MailerService({});
    for (let i = 0; i < 30; i++) await m.send({ to: `u${i}@b.co`, subject: "x", text: "x", html: "x" });
    assert.equal(m.outbox.length, 20);
    assert.equal(m.outbox[19]!.to, "u29@b.co");
  });

  it("a PRODUCTION server with no SMTP refuses to send: invitations are never silently dropped or logged", async () => {
    const m = new MailerService({ NODE_ENV: "production" });
    assert.equal(m.mode, "unconfigured");
    await assert.rejects(m.send({ to: "a@b.co", subject: "x", text: "x", html: "x" }), MailNotConfiguredError);
    assert.equal(m.outbox.length, 0);
  });

  it("SMTP needs a sender address", () => {
    assert.throws(() => new MailerService({ SMTP_HOST: "smtp.example.test" }), /MAIL_FROM is required/);
  });

  it("really speaks SMTP: connects, sends from the configured sender to the right person, with a text and an html part", async () => {
    const received: { from: string; to: string[]; data: string }[] = [];
    const server = new SMTPServer({
      authOptional: true, disabledCommands: ["STARTTLS"], logger: false,
      onData(stream, session, cb) {
        const chunks: Buffer[] = [];
        stream.on("data", (c: Buffer) => chunks.push(c));
        stream.on("end", () => { received.push({ from: session.envelope.mailFrom ? session.envelope.mailFrom.address : "", to: session.envelope.rcptTo.map((r) => r.address), data: Buffer.concat(chunks).toString("utf8") }); cb(); });
      },
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    const port = (server.server.address() as { port: number }).port;
    try {
      const mailer = new MailerService({ SMTP_HOST: "127.0.0.1", SMTP_PORT: String(port), SMTP_SECURE: "false", MAIL_FROM: "Kiosk <no-reply@mail.test>" });
      assert.equal(mailer.mode, "smtp");
      const mail = inviteEmail({ locale: "en", kind: "INVITE", service: "Chez Sam", link: "https://app.test/accept-invite?token=abc123", hours: 72, name: "Sam" });
      await mailer.send({ to: "sam@chez.test", ...mail });

      assert.equal(received.length, 1);
      const got = received[0]!;
      assert.equal(got.from, "no-reply@mail.test");
      assert.deepEqual(got.to, ["sam@chez.test"]);
      // Mail bodies are encoded (quoted-printable wraps long lines): undo that before looking for the link.
      const decoded = got.data.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
      assert.match(decoded, /Subject: You have been invited to Chez Sam/);
      assert.match(decoded, /From: Kiosk <no-reply@mail\.test>/);
      assert.ok(decoded.includes("https://app.test/accept-invite?token=abc123"));
      assert.match(decoded, /Content-Type: text\/plain/);
      assert.match(decoded, /Content-Type: text\/html/);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });

  it("an SMTP server that is down is an error the caller can handle, not a hang", async () => {
    const mailer = new MailerService({ SMTP_HOST: "127.0.0.1", SMTP_PORT: "1", MAIL_FROM: "x@y.test" });
    await assert.rejects(mailer.send({ to: "a@b.co", subject: "x", text: "x", html: "x" }));
  });
});

describe("the links", () => {
  function setup(rows: any[] = []) {
    const writes: { op: string; args: any }[] = [];
    const prisma: any = {
      accountToken: {
        updateMany: (a: any) => ({ op: "cancelOld", args: a }),
        create: (a: any) => ({ op: "create", args: a }),
        findUnique: async (a: any) => rows.find((r) => r.tokenHash === a.where.tokenHash) ?? null,
      },
      $transaction: async (ops: any[]) => { writes.push(...ops); return []; },
    };
    return { svc: new AccountTokenService(prisma), writes };
  }
  const NOW = Date.parse("2026-10-01T12:00:00Z");

  it("the token exists only in the email: the database gets its SHA-256, never the token", async () => {
    const { svc, writes } = setup();
    const { token } = await svc.issue({ realm: "PLATFORM", kind: "INVITE", userId: "u1" }, NOW);
    const created = writes.find((w) => w.op === "create")!.args.data;
    assert.equal(created.tokenHash, sha(token));
    assert.notEqual(created.tokenHash, token);
    assert.equal(JSON.stringify(created).includes(token), false);
    assert.ok(token.length >= 40);
  });

  it("is random every time", async () => {
    const { svc } = setup();
    const seen = new Set((await Promise.all(Array.from({ length: 50 }, () => svc.issue({ realm: "PLATFORM", kind: "INVITE", userId: "u1" }, NOW)))).map((t) => t.token));
    assert.equal(seen.size, 50);
  });

  it("an invitation lasts 72 hours, a reset 24", async () => {
    const { svc, writes } = setup();
    await svc.issue({ realm: "PLATFORM", kind: "INVITE", userId: "u1" }, NOW);
    await svc.issue({ realm: "PLATFORM", kind: "RESET", userId: "u1" }, NOW);
    const [inv, reset] = writes.filter((w) => w.op === "create").map((w) => w.args.data.expiresAt.getTime() - NOW);
    assert.deepEqual([inv, reset], [72 * 3_600_000, 24 * 3_600_000]);
    assert.deepEqual(TTL_HOURS, { INVITE: 72, RESET: 24 });
  });

  it("a new link cancels this person's earlier unused ones, and only theirs", async () => {
    const { svc, writes } = setup();
    await svc.issue({ realm: "RESTAURANT", kind: "RESET", userId: "u1", restaurantId: "r1" }, NOW);
    const cancel = writes.find((w) => w.op === "cancelOld")!.args;
    assert.deepEqual(cancel.where, { realm: "RESTAURANT", userId: "u1", usedAt: null, expiresAt: { gt: new Date(NOW) } });
    assert.deepEqual(cancel.data, { expiresAt: new Date(NOW) });
    assert.equal(writes[0]!.op, "cancelOld");   // before the new one is created
  });

  it("peek: a good link is valid; unknown, used, expired, wrong-realm and junk are all just 'not valid'", async () => {
    const good = "g".repeat(43), used = "u".repeat(43), old = "o".repeat(43), other = "x".repeat(43);
    const row = (t: string, over: any = {}) => ({ id: t[0], tokenHash: hashToken(t), realm: "PLATFORM", kind: "INVITE", userId: "u1", restaurantId: null, usedAt: null, expiresAt: new Date(NOW + 1000), ...over });
    const { svc } = setup([row(good), row(used, { usedAt: new Date() }), row(old, { expiresAt: new Date(NOW - 1) }), row(other, { realm: "RESTAURANT" })]);
    assert.deepEqual(await svc.peek(good, "PLATFORM", NOW), { id: "g", kind: "INVITE", userId: "u1", restaurantId: null });
    for (const t of [used, old, other, "nope".repeat(12), "", "short", "z".repeat(500), undefined as never, 42 as never]) assert.equal(await svc.peek(t, "PLATFORM", NOW), null);
  });
});

describe("sending and accepting an invitation", () => {
  const NEWPASS = "my-own-long-password-1";

  function setup(opts: { token?: any; platformUser?: any; restaurantUser?: any; restaurant?: any; usedCount?: number; mail?: "ok" | "fail" | "unconfigured" } = {}) {
    const tx: { op: string; args: any }[] = [];
    const sent: any[] = [];
    const audits: any[] = [];
    const invalidated: string[] = [];
    const issued: any[] = [];
    const rec = (op: string, result: any = undefined) => (args: any) => { tx.push({ op, args }); return result === undefined ? { count: 1 } : result; };
    const prisma: any = {
      accountToken: { updateMany: async (a: any) => { tx.push({ op: "useToken", args: a }); return { count: opts.usedCount ?? 1 }; } },
      platformUser: { findUnique: async () => opts.platformUser ?? null, update: async (a: any) => { tx.push({ op: "platformUserUpdate", args: a }); return {}; } },
      platformSession: { updateMany: async (a: any) => { tx.push({ op: "platformSessions", args: a }); return {}; } },
      restaurantUser: { findFirst: async () => opts.restaurantUser ?? null, updateMany: async (a: any) => { tx.push({ op: "restaurantUserUpdate", args: a }); return {}; } },
      restaurantSession: { updateMany: async (a: any) => { tx.push({ op: "restaurantSessions", args: a }); return {}; } },
      restaurant: { findUnique: async () => opts.restaurant ?? null },
      $transaction: async (fn: any) => fn(prisma),
    };
    void rec;
    const tokens: any = { issue: async (a: any) => { issued.push(a); return { token: "TOKEN-VALUE-1234567890-abcdefghijkl", expiresAt: new Date() }; }, peek: async () => opts.token ?? null };
    const mailer: any = { send: async (m: any) => { if (opts.mail === "fail") throw new Error("connect ECONNREFUSED 127.0.0.1:587"); if (opts.mail === "unconfigured") throw new MailNotConfiguredError(); sent.push(m); } };
    const svc = new AccountInviteService(prisma, tokens, mailer, new PasswordService(), { invalidate: (id: string) => invalidated.push(id) } as never, { record: async (e: unknown) => { audits.push(e); } } as never);
    return { svc, tx, sent, audits, invalidated, issued };
  }
  const target = { realm: "PLATFORM" as const, kind: "INVITE" as const, user: { id: "u1", email: "sam@chez.co", fullName: "Sam" } };

  describe("sending", () => {
    it("emails the person the link, to the right app: the admin for the platform, the back office for a restaurant", async () => {
      const a = setup();
      assert.deepEqual(await a.svc.sendLink(target, { ADMIN_APP_URL: "https://admin.chez.co/", BACKOFFICE_APP_URL: "https://office.chez.co" }), { sent: true });
      assert.equal(a.sent[0].to, "sam@chez.co");
      assert.ok(a.sent[0].text.includes("https://admin.chez.co/accept-invite?token=TOKEN-VALUE-1234567890-abcdefghijkl"));   // no double slash

      const b = setup();
      await b.svc.sendLink({ realm: "RESTAURANT", kind: "INVITE", user: target.user, restaurant: { id: "r1", name: "Chez Sam", slug: "chez-sam", locale: "fr" } }, { ADMIN_APP_URL: "https://admin.chez.co", BACKOFFICE_APP_URL: "https://office.chez.co" });
      assert.ok(b.sent[0].text.includes("https://office.chez.co/accept-invite?token="));
      assert.equal(b.sent[0].subject, "Vous êtes invité(e) sur Chez Sam");   // the restaurant's language
      assert.deepEqual(b.issued[0], { realm: "RESTAURANT", kind: "INVITE", userId: "u1", restaurantId: "r1" });
    });

    it("the platform's own invitations are in English and name the platform admin", async () => {
      const a = setup(); await a.svc.sendLink(target, {});
      assert.equal(a.sent[0].subject, "You have been invited to the Kiosk platform admin");
      assert.ok(a.sent[0].text.includes("http://localhost:3004/accept-invite?token="));
    });

    it("a failed send never throws: the account exists, and the answer says why, in plain words", async () => {
      assert.deepEqual((await setup({ mail: "unconfigured" }).svc.sendLink(target, {})).sent, false);
      assert.match((await setup({ mail: "unconfigured" }).svc.sendLink(target, {})).error!, /not set up on this server/);
      const r = await setup({ mail: "fail" }).svc.sendLink(target, {});
      assert.equal(r.sent, false);
      assert.match(r.error!, /could not be sent.*ECONNREFUSED/);
    });
  });

  describe("opening the page (preview)", () => {
    it("says who the link is for without using it up", async () => {
      const a = setup({ token: { id: "t1", kind: "INVITE", userId: "u1", restaurantId: null }, platformUser: { email: "sam@chez.co", fullName: "Sam", isActive: true } });
      assert.deepEqual(await a.svc.preview("PLATFORM", "tok"), { email: "sam@chez.co", name: "Sam", kind: "INVITE", service: "Platform admin", slug: null });
      assert.equal(a.tx.length, 0);
    });
    it("for a restaurant: the restaurant's name and sign-in address", async () => {
      const a = setup({ token: { id: "t1", kind: "RESET", userId: "u1", restaurantId: "r1" }, restaurantUser: { email: "s@c.co", fullName: null, isActive: true }, restaurant: { name: "Chez Sam", slug: "chez-sam" } });
      assert.deepEqual(await a.svc.preview("RESTAURANT", "tok"), { email: "s@c.co", name: null, kind: "RESET", service: "Chez Sam", slug: "chez-sam" });
    });
    it("every kind of bad link gets the very same answer", async () => {
      const msgs = new Set<string>();
      for (const opts of [{}, { token: { id: "t", kind: "INVITE", userId: "u1", restaurantId: null }, platformUser: { email: "x", isActive: false } }, { token: { id: "t", kind: "INVITE", userId: "u1", restaurantId: null } }]) {
        await assert.rejects(setup(opts as never).svc.preview("PLATFORM", "tok"), (e) => { msgs.add((e as Error).message); return e instanceof BadRequestException; });
      }
      assert.equal(msgs.size, 1);
    });
  });

  describe("choosing the password (accept)", () => {
    const platformToken = { id: "t1", kind: "INVITE" as const, userId: "u1", restaurantId: null };

    it("platform: uses the link up first, sets their own password, ends every session, clears the lock, and is audited", async () => {
      const a = setup({ token: platformToken, platformUser: { id: "u1", email: "sam@chez.co", isActive: true } });
      const out = await a.svc.accept("PLATFORM", "tok", NEWPASS);
      assert.deepEqual(out, { email: "sam@chez.co", slug: null });
      assert.deepEqual(a.tx.map((t) => t.op), ["useToken", "platformUserUpdate", "platformSessions"]);   // the link is spent before anything else
      assert.deepEqual(a.tx[0]!.args.where.id, "t1");
      assert.equal(a.tx[0]!.args.where.usedAt, null);
      const upd = a.tx[1]!.args.data;
      assert.ok(await new PasswordService().verify(upd.passwordHash, NEWPASS));
      assert.ok(upd.passwordSetAt instanceof Date);
      assert.deepEqual([upd.mustChangePassword, upd.failedLoginCount, upd.lockedUntil], [false, 0, null]);
      assert.equal(a.tx[2]!.args.where.userId, "u1");
      assert.deepEqual(a.invalidated, ["u1"]);
      assert.equal(a.audits[0].action, "platform_user.invite_accepted");
      assert.equal(JSON.stringify(a.audits).includes(NEWPASS), false);
    });

    it("a reset is audited as one", async () => {
      const a = setup({ token: { ...platformToken, kind: "RESET" }, platformUser: { id: "u1", email: "s@c.co", isActive: true } });
      await a.svc.accept("PLATFORM", "tok", NEWPASS);
      assert.equal(a.audits[0].action, "platform_user.password_reset_completed");
    });

    it("restaurant: every write carries the restaurant, and the sign-in address is handed back", async () => {
      const a = setup({ token: { id: "t1", kind: "INVITE", userId: "u1", restaurantId: "r1" }, restaurantUser: { id: "u1", email: "s@c.co", isActive: true }, restaurant: { slug: "chez-sam" } });
      assert.deepEqual(await a.svc.accept("RESTAURANT", "tok", NEWPASS), { email: "s@c.co", slug: "chez-sam" });
      const upd = a.tx.find((t) => t.op === "restaurantUserUpdate")!.args;
      assert.deepEqual(upd.where, { id: "u1", restaurantId: "r1" });
      assert.equal(upd.data.failedLoginCount, 0);
      assert.deepEqual(a.tx.find((t) => t.op === "restaurantSessions")!.args.where, { restaurantId: "r1", userId: "u1", revokedAt: null });
      assert.equal(a.audits[0].restaurantId, "r1");
      assert.equal(a.audits[0].action, "restaurant_user.invite_accepted");
      assert.deepEqual(a.invalidated, []);   // that cache is for platform staff only
    });

    it("two people opening the same link: only the first wins, the second changes nothing", async () => {
      const a = setup({ token: platformToken, platformUser: { id: "u1", email: "s@c.co", isActive: true }, usedCount: 0 });
      await assert.rejects(a.svc.accept("PLATFORM", "tok", NEWPASS), BadRequestException);
      assert.deepEqual(a.tx.map((t) => t.op), ["useToken"]);   // nothing else was written
    });

    it("a link that is not valid, or whose person has since been switched off, changes nothing", async () => {
      const none = setup();
      await assert.rejects(none.svc.accept("PLATFORM", "tok", NEWPASS), BadRequestException);
      assert.equal(none.tx.length, 0);
      const off = setup({ token: platformToken, platformUser: { id: "u1", email: "s@c.co", isActive: false } });
      await assert.rejects(off.svc.accept("PLATFORM", "tok", NEWPASS), BadRequestException);
      assert.equal(off.tx.some((t) => t.op === "platformUserUpdate"), false);
    });
  });
});

describe("the public pages are reachable without signing in, and only for this", () => {
  it("preview and accept have no login guard on either side", async () => {
    Object.assign(process.env, { DATABASE_URL: "postgres://test", DIRECT_URL: "postgres://test", JWT_SECRET: "test-secret-".padEnd(40, "x"), ENCRYPTION_KEY: "0".repeat(64) });
    const { AuthController } = await import("../src/auth/auth.controller.js");
    const { RestaurantAuthController } = await import("../src/restaurant-auth/restaurant-auth.controller.js");
    for (const [ctl, names] of [[AuthController, ["previewInvite", "acceptInvite"]], [RestaurantAuthController, ["previewInvite", "acceptInvite"]]] as const) {
      const proto = (ctl as never as { prototype: Record<string, object> }).prototype;
      for (const n of names) {
        assert.equal(typeof proto[n], "function", `${ctl.name}.${n} exists`);
        assert.equal(Reflect.getMetadata("__guards__", proto[n]!), undefined, `${ctl.name}.${n} is public`);
      }
    }
  });
});
