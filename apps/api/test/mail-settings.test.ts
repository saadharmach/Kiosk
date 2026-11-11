import assert from "node:assert/strict";
import net from "node:net";
import { after, describe, it } from "node:test";
import { BadRequestException } from "@nestjs/common";
import { MailSettingsService, explainSmtp } from "../src/admin/mail-settings.service.js";
import { smtpOptions, type MailSettingsValues } from "../src/common/mail-settings.js";
import { MailDisabledError, MailNotConfiguredError, MailerService } from "../src/common/mailer.service.js";

/** A pretend SMTP server on this machine: takes mail, keeps it, sends nothing anywhere. */
function fakeSmtp() {
  const mails: { from: string; to: string[]; data: string }[] = [];
  const server = net.createServer((sock) => {
    sock.write("220 fake ESMTP\r\n");
    let buf = "", inData = false, data = "";
    let cur = { from: "", to: [] as string[] };
    sock.on("data", (d) => {
      buf += d.toString("utf8");
      for (let i = buf.indexOf("\r\n"); i >= 0; i = buf.indexOf("\r\n")) {
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        if (inData) {
          if (line === ".") { inData = false; mails.push({ ...cur, data }); data = ""; sock.write("250 queued\r\n"); } else data += `${line}\n`;
          continue;
        }
        const cmd = line.slice(0, 4).toUpperCase();
        if (cmd === "EHLO" || cmd === "HELO") sock.write("250-fake\r\n250 8BITMIME\r\n");
        else if (cmd === "MAIL") { cur = { from: line, to: [] }; sock.write("250 OK\r\n"); }
        else if (cmd === "RCPT") { cur.to.push(line); sock.write("250 OK\r\n"); }
        else if (cmd === "DATA") { inData = true; sock.write("354 go on\r\n"); }
        else if (cmd === "QUIT") { sock.write("221 bye\r\n"); sock.end(); }
        else sock.write("250 OK\r\n");
      }
    });
    sock.on("error", () => {});
  });
  return new Promise<{ port: number; mails: typeof mails; close: () => Promise<void> }>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve({ port: (server.address() as net.AddressInfo).port, mails, close: () => new Promise((r) => server.close(() => r())) })));
}
const servers: { close: () => Promise<void> }[] = [];
after(async () => { await Promise.all(servers.map((s) => s.close())); });

const values = (over: Partial<MailSettingsValues> = {}): MailSettingsValues => ({
  enabled: true, fromEmail: "no-reply@nexborn.ma", fromName: "NEXBORN", host: "127.0.0.1", port: 25,
  security: "NONE", authEnabled: false, username: null, password: null, ...over,
});
const form = (over: Record<string, unknown> = {}) => ({
  enabled: true, fromEmail: "no-reply@nexborn.ma", fromName: "NEXBORN", host: "smtp.example.ma", port: 587,
  security: "STARTTLS" as const, authEnabled: true, username: "mailer", password: "", ...over,
});

describe("how the security type reaches the SMTP server", () => {
  it("SSL is TLS from the start, STARTTLS insists on switching to TLS, NONE never tries", () => {
    assert.deepEqual([smtpOptions(values({ security: "SSL" })).secure, smtpOptions(values({ security: "SSL" })).requireTLS], [true, false]);
    assert.deepEqual([smtpOptions(values({ security: "STARTTLS" })).secure, smtpOptions(values({ security: "STARTTLS" })).requireTLS], [false, true]);
    assert.equal(smtpOptions(values({ security: "NONE" })).ignoreTLS, true);
  });
  it("signs in only when authentication is on", () => {
    assert.equal(smtpOptions(values()).auth, undefined);
    assert.deepEqual(smtpOptions(values({ authEnabled: true, username: "u", password: "p" })).auth, { user: "u", pass: "p" });
  });
});

describe("sending with the admin's settings", () => {
  it("every email goes through the admin's SMTP server and sender, not the server's", async () => {
    const smtp = await fakeSmtp(); servers.push(smtp);
    const saved = { ...values({ port: smtp.port }), updatedAt: new Date() };
    const mailer = new MailerService({ SMTP_HOST: "smtp.server-env.ma", MAIL_FROM: "env@x.ma" }, { load: async () => saved } as never);
    await mailer.send({ to: "manager@resto.ma", subject: "Invitation", text: "Bonjour", html: "<p>Bonjour</p>" });
    assert.equal(smtp.mails.length, 1);
    assert.match(smtp.mails[0]!.from, /no-reply@nexborn\.ma/);
    assert.match(smtp.mails[0]!.to[0]!, /manager@resto\.ma/);
    assert.match(smtp.mails[0]!.data, /From: NEXBORN <no-reply@nexborn\.ma>/);
  });

  it("switched off: nothing is sent, and the invitation code treats it like 'not configured'", async () => {
    const mailer = new MailerService({}, { load: async () => ({ ...values(), enabled: false, updatedAt: new Date() }) } as never);
    await assert.rejects(mailer.send({ to: "a@b.ma", subject: "s", text: "t", html: "h" }), (e) => e instanceof MailDisabledError && e instanceof MailNotConfiguredError);
  });

  it("nothing saved in the admin: the server's own settings, as before", async () => {
    const mailer = new MailerService({}, { load: async () => null } as never);
    await mailer.send({ to: "a@b.ma", subject: "s", text: "t", html: "h" });
    assert.equal(mailer.outbox.length, 1, "development: written to the log");
  });
});

describe("the admin's email settings page", () => {
  function setup(saved: (MailSettingsValues & { updatedAt: Date }) | null = null) {
    let stored = saved;
    const writes: any[] = [], audits: any[] = [];
    const store = {
      load: async () => stored,
      save: async (v: any) => { writes.push(v); stored = { ...(stored ?? {}), ...v, password: v.password === undefined ? stored?.password ?? null : v.password, updatedAt: new Date() }; return stored; },
    };
    const svc = new MailSettingsService(store as never, { server: { host: "smtp-relay.brevo.com", port: 587, secure: false, username: "brevo-user", from: "NEXBORN <x@y.ma>" } } as never, { record: async (a: any) => { audits.push(a); } } as never);
    return { svc, writes, audits, stored: () => stored };
  }

  it("shows where email comes from today and never gives the password back", async () => {
    assert.equal((await setup().svc.view()).source, "server");
    const v = await setup({ ...values({ authEnabled: true, username: "u", password: "s3cret" }), updatedAt: new Date() }).svc.view();
    assert.equal(v.source, "admin");
    assert.equal(v.settings?.passwordSet, true);
    assert.ok(!JSON.stringify(v).includes("s3cret"));
  });

  it("an empty password field keeps the saved one; a typed one replaces it; authentication off keeps none", async () => {
    const s = setup({ ...values({ authEnabled: true, username: "u", password: "old" }), updatedAt: new Date() });
    await s.svc.save(form({ username: "u", password: "" }) as never, { id: "a1" });
    assert.equal(s.writes[0].password, undefined, "kept");
    await s.svc.save(form({ username: "u", password: "new" }) as never, { id: "a1" });
    assert.equal(s.writes[1].password, "new");
    await s.svc.save(form({ authEnabled: false, username: "", password: "" }) as never, { id: "a1" });
    assert.equal(s.writes[2].password, null);
    assert.ok(!JSON.stringify(s.audits).includes("new\""), "the audit log never holds the password");
    assert.equal(s.audits[1].after.passwordChanged, true);
  });

  it("asks for what is missing in plain words", async () => {
    const s = setup();
    await assert.rejects(s.svc.save(form({ username: "" }) as never, { id: "a1" }), /SMTP username/);
    await assert.rejects(s.svc.save(form({ password: "" }) as never, { id: "a1" }), (e) => e instanceof BadRequestException && /SMTP password/.test(e.message));
  });

  it("tests the connection and sends a test email with the form as it is, before saving", async () => {
    const smtp = await fakeSmtp(); servers.push(smtp);
    const s = setup();
    const f = form({ host: "127.0.0.1", port: smtp.port, security: "NONE", authEnabled: false, username: "", password: "" });
    assert.deepEqual(await s.svc.testConnection(f as never), { ok: true, message: `Connected to 127.0.0.1:${smtp.port}.` });
    const r = await s.svc.sendTest(f as never, "owner@nexborn.ma", { id: "a1" });
    assert.equal(r.ok, true);
    assert.equal(smtp.mails.length, 1);
    assert.match(smtp.mails[0]!.data, /Subject: .*NEXBORN.*test.*email/);
    assert.equal(s.writes.length, 0, "testing saves nothing");
  });

  it("a server that is not there: a sentence, not an error page", async () => {
    const free = await fakeSmtp(); const port = free.port; await free.close();
    const r = await setup().svc.testConnection(form({ host: "127.0.0.1", port, security: "NONE", authEnabled: false }) as never);
    assert.deepEqual(r, { ok: false, message: "The SMTP server refused the connection: check the server and the port." });
  });

  it("explains the usual SMTP problems", () => {
    assert.match(explainSmtp({ code: "EAUTH" }), /username or password/);
    assert.match(explainSmtp({ code: "ENOTFOUND" }), /does not exist/);
    assert.match(explainSmtp({ code: "ESOCKET", message: "wrong version number" }), /SSL goes with 465/);
  });
});
