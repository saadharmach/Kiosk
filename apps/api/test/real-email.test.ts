import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException } from "@nestjs/common";
import { PasswordService } from "../src/auth/password.service.js";
import { EmailCheckService, checkRealEmail, offlineProblem, type MailResolver } from "../src/common/real-email.js";
import { RestaurantUsersService } from "../src/admin/restaurant-users.service.js";
import { RestaurantsService } from "../src/admin/restaurants.service.js";
import { TeamService } from "../src/admin/team.service.js";

const err = (code: string) => Object.assign(new Error(code), { code });
/** A resolver with a tiny pretend internet: domain -> records. Anything not listed does not exist. */
function resolver(world: Record<string, { mx?: { exchange: string; priority: number }[]; a?: string[]; aaaa?: string[]; fail?: string }>) {
  const calls: string[] = [];
  const r: MailResolver = {
    resolveMx: async (d) => { calls.push(`mx ${d}`); const w = world[d]; if (w?.fail) throw err(w.fail); if (!w?.mx) throw err("ENODATA"); return w.mx; },
    resolve4: async (d) => { calls.push(`a ${d}`); const w = world[d]; if (w?.fail) throw err(w.fail); if (!w?.a) throw err("ENODATA"); return w.a; },
    resolve6: async (d) => { calls.push(`aaaa ${d}`); const w = world[d]; if (w?.fail) throw err(w.fail); if (!w?.aaaa) throw err("ENODATA"); return w.aaaa; },
  };
  return { r, calls };
}
const MAIL = [{ exchange: "mx.real.com", priority: 10 }];

describe("addresses that cannot be real, without any network", () => {
  it("placeholder and test domains", () => {
    for (const e of ["a@resto-a.test", "a@shop.example", "a@x.invalid", "a@kiosk.local", "a@printer.lan", "a@example.com", "a@mail.example.org", "a@localhost", "a@nodots", "a@corp.internal"]) {
      assert.equal(offlineProblem(e)?.reason, "reserved", e);
    }
  });
  it("well-known throw-away mailbox services, and their subdomains", () => {
    for (const e of ["a@mailinator.com", "a@YOPMAIL.com", "a@x.guerrillamail.com", "a@10minutemail.com"]) assert.equal(offlineProblem(e)?.reason, "disposable", e);
  });
  it("ordinary domains pass this stage, including ones that merely contain 'test' or 'example'", () => {
    for (const e of ["sam@gmail.com", "owner@chez-sam.ma", "a@attestation.com", "a@examples.fr", "a@mytest.com"]) assert.equal(offlineProblem(e), null, e);
  });
  it("the message names the domain and says what to do", () => {
    assert.match(offlineProblem("a@resto-a.test")!.message, /resto-a\.test is not a real mail domain.*real email address/);
  });
});

describe("does the domain have a mail server", () => {
  it("an MX record is enough", async () => {
    assert.deepEqual(await checkRealEmail("sam@real.com", resolver({ "real.com": { mx: MAIL } }).r), { ok: true, checked: true });
  });
  it("no MX but an address record: mail is delivered to the domain itself", async () => {
    assert.deepEqual(await checkRealEmail("sam@bare.com", resolver({ "bare.com": { a: ["1.2.3.4"] } }).r), { ok: true, checked: true });
    assert.deepEqual(await checkRealEmail("sam@v6.com", resolver({ "v6.com": { aaaa: ["::1"] } }).r), { ok: true, checked: true });
  });
  it("neither: the domain cannot receive email, and the message says to check the spelling", async () => {
    const v = await checkRealEmail("sam@gmial-typo.com", resolver({}).r);
    assert.equal(v.ok, false);
    assert.match((v as { message: string }).message, /gmial-typo\.com cannot receive email.*spelling/);
  });
  it("a domain that publishes 'no mail here' (a single MX of '.') is refused", async () => {
    const v = await checkRealEmail("sam@nomail.com", resolver({ "nomail.com": { mx: [{ exchange: ".", priority: 0 }] } }).r);
    assert.equal(v.ok, false);
  });
  it("is not case- or space-sensitive", async () => {
    assert.deepEqual(await checkRealEmail("  Sam@REAL.com ", resolver({ "real.com": { mx: MAIL } }).r), { ok: true, checked: true });
  });
  it("a broken lookup never blocks someone: the address is let through, and the log says it was not checked", async () => {
    for (const code of ["ETIMEOUT", "ESERVFAIL", "ECONNREFUSED", "EAI_AGAIN"]) {
      const logged: string[] = [];
      assert.deepEqual(await checkRealEmail("sam@real.com", resolver({ "real.com": { fail: code } }).r, (m) => logged.push(m)), { ok: true, checked: false }, code);
      assert.equal(logged.length, 1);
    }
  });
  it("a lookup that never answers is given up on after a few seconds", async () => {
    const hang: MailResolver = { resolveMx: () => new Promise(() => undefined), resolve4: () => new Promise(() => undefined), resolve6: () => new Promise(() => undefined) };
    const t0 = Date.now();
    assert.deepEqual(await checkRealEmail("sam@slow.com", hang), { ok: true, checked: false });
    assert.ok(Date.now() - t0 < 6000);
  });
  it("placeholder domains are refused without asking the network at all", async () => {
    const { r, calls } = resolver({});
    assert.equal((await checkRealEmail("a@resto-a.test", r)).ok, false);
    assert.deepEqual(calls, []);
  });
});

describe("EmailCheckService", () => {
  const make = (world: Parameters<typeof resolver>[0], env?: string) => {
    const old = process.env.EMAIL_CHECK;
    if (env === undefined) delete process.env.EMAIL_CHECK; else process.env.EMAIL_CHECK = env;
    const svc = new EmailCheckService();
    if (old === undefined) delete process.env.EMAIL_CHECK; else process.env.EMAIL_CHECK = old;
    const { r, calls } = resolver(world);
    svc.resolver = r;
    return { svc, calls };
  };

  it("refuses with a plain message a person can act on", async () => {
    const { svc } = make({});
    await assert.rejects(svc.assertReal("sam@resto-a.test"), (e) => e instanceof BadRequestException && /not a real mail domain/.test((e as Error).message));
  });

  it("asks the network once per domain and remembers a definite answer for a while, then asks again", async () => {
    const { svc, calls } = make({ "real.com": { mx: MAIL } });
    const t0 = 1_000_000;
    await svc.assertReal("a@real.com", t0); await svc.assertReal("b@real.com", t0 + 60_000);
    assert.equal(calls.filter((c) => c.startsWith("mx")).length, 1);
    await svc.assertReal("c@real.com", t0 + 11 * 60_000);
    assert.equal(calls.filter((c) => c.startsWith("mx")).length, 2);
  });

  it("a refusal is remembered too, so a typo is not looked up again and again", async () => {
    const { svc, calls } = make({});
    await assert.rejects(svc.assertReal("a@nowhere.com", 1)); await assert.rejects(svc.assertReal("b@nowhere.com", 2));
    assert.equal(calls.filter((c) => c.startsWith("mx")).length, 1);
  });

  it("but a 'could not check' answer is not remembered: the next person is checked properly", async () => {
    const { svc, calls } = make({ "flaky.com": { fail: "ETIMEOUT" } });
    await svc.assertReal("a@flaky.com", 1); await svc.assertReal("b@flaky.com", 2);
    assert.equal(calls.filter((c) => c.startsWith("mx")).length, 2);
  });

  it("EMAIL_CHECK=off skips everything (for a machine with no internet)", async () => {
    const { svc, calls } = make({}, "off");
    await svc.assertReal("a@resto-a.test");
    assert.deepEqual(calls, []);
  });
});

describe("where accounts are made, a placeholder address is refused and nothing is written", () => {
  const strict = () => { const s = new EmailCheckService(); s.resolver = resolver({ "gmail.com": { mx: MAIL } }).r; return s; };

  it("a restaurant user", async () => {
    const writes: unknown[] = [];
    const prisma = { restaurant: { findUnique: async () => ({ id: "r1", name: "Chez", slug: "chez", locale: "fr" }) }, restaurantUser: { findFirst: async () => null, create: async (a: unknown) => { writes.push(a); return {}; } } };
    const svc = new RestaurantUsersService(prisma as never, new PasswordService(), { record: async () => undefined } as never, strict(), { sendLink: async () => ({ sent: true }) } as never);
    await assert.rejects(svc.create("r1", { email: "owner@resto-a.test", role: "OWNER" }, { id: "a" }), BadRequestException);
    assert.equal(writes.length, 0);
    await svc.create("r1", { email: "Owner@Gmail.com", role: "OWNER" }, { id: "a" });
    assert.equal(writes.length, 1);
  });

  it("a platform team member", async () => {
    const writes: unknown[] = [];
    const prisma = { platformUser: { findUnique: async () => null, create: async (a: unknown) => { writes.push(a); return { id: "n", email: "x", role: "SUPPORT" }; } } };
    const svc = new TeamService(prisma as never, new PasswordService(), { invalidate: () => undefined } as never, { record: async () => undefined } as never, strict(), { sendLink: async () => ({ sent: true }) } as never);
    await assert.rejects(svc.create({ email: "boss@kiosk.local", role: "SUPPORT" }, { id: "a" }), BadRequestException);
    assert.equal(writes.length, 0);
    await svc.create({ email: "boss@gmail.com", role: "SUPPORT" }, { id: "a" });
    assert.equal(writes.length, 1);
  });

  it("a restaurant's contact email, when one is given (it is optional)", async () => {
    const writes: unknown[] = [];
    const prisma = { restaurant: { findUnique: async () => null, create: async (a: unknown) => { writes.push(a); return { id: "r" }; } } };
    const svc = new RestaurantsService(prisma as never, { record: async () => undefined } as never, strict());
    await assert.rejects(svc.create({ slug: "a-b", name: "Chez", contactEmail: "info@chez.test" } as never, { id: "a" }, {} as never), BadRequestException);
    assert.equal(writes.length, 0);
    await svc.create({ slug: "a-b", name: "Chez" } as never, { id: "a" }, {} as never);        // no contact email: fine
    await svc.create({ slug: "a-c", name: "Chez", contactEmail: "info@gmail.com" } as never, { id: "a" }, {} as never);
    assert.equal(writes.length, 2);
  });

  it("and when a restaurant's contact email is changed later", async () => {
    const writes: unknown[] = [];
    const row = { id: "r1", slug: "a-b", name: "Chez", status: "ACTIVE" };
    const prisma = { restaurant: { findUnique: async () => row, update: async (a: unknown) => { writes.push(a); return row; } } };
    const svc = new RestaurantsService(prisma as never, { record: async () => undefined } as never, strict());
    await assert.rejects(svc.update("r1", { contactEmail: "info@chez.test" }, { id: "a" }, {} as never), BadRequestException);
    assert.equal(writes.length, 0);
    await svc.update("r1", { contactEmail: "info@gmail.com" }, { id: "a" }, {} as never);
    assert.equal(writes.length, 1);
  });
});
