import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { BadRequestException } from "@nestjs/common";
import { PAIRING_TTL_MIN, PrintingService, newPairingCode, normalizePairingCode, summarizePrinter } from "../src/printing/printing.service.js";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

describe("setup codes", () => {
  it("look like ABCD-EFGH and avoid the characters people mix up", () => {
    for (let i = 0; i < 300; i++) {
      const c = newPairingCode();
      assert.match(c, /^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
      assert.equal(normalizePairingCode(c), c.replace("-", ""));
    }
  });
  it("typing is forgiving: case, dashes and spaces do not matter; junk is refused", () => {
    assert.equal(normalizePairingCode("k7qf-92xm"), "K7QF92XM");
    assert.equal(normalizePairingCode(" K7QF 92XM "), "K7QF92XM");
    for (const bad of ["", "K7QF", "K7QF-92XM-1", "K7QF-92X0", "K7QF-92XI", "'; DROP"]) assert.equal(normalizePairingCode(bad), null, bad);
  });
});

function setup(printers: any[], opts: { kiosks?: any[] } = {}) {
  const calls: { op: string; args: any }[] = [];
  const prisma: any = {
    printer: {
      findFirst: async (a: any) => printers.find((p) => Object.entries(a.where).every(([k, v]) => v === undefined || p[k] === v || (v === null && p[k] == null))) ?? null,
      findUnique: async (a: any) => printers.find((p) => Object.entries(a.where).every(([k, v]) => p[k] === v)) ?? null,
      updateMany: async (a: any) => {
        calls.push({ op: "updateMany", args: a });
        const hit = printers.filter((p) => Object.entries(a.where).every(([k, v]: [string, any]) =>
          v && typeof v === "object" && "gt" in v ? p[k] instanceof Date && p[k] > v.gt : p[k] === v));
        for (const p of hit) Object.assign(p, a.data);
        return { count: hit.length };
      },
    },
    restaurant: { findUniqueOrThrow: async () => ({ name: "Chez Sam", timezone: "UTC", settings: null }) },
    kiosk: { findFirst: async (a: any) => (opts.kiosks ?? []).find((k) => k.id === a.where.id && k.restaurantId === a.where.restaurantId) ?? null },
  };
  return { svc: new PrintingService(prisma), printers, calls };
}
const printer = (over: any = {}) => ({ id: "p1", restaurantId: "r1", kioskId: null, kind: "RECEIPT", connection: "NETWORK", address: "10.0.0.5", port: 9100, config: {}, ...over });

describe("issuing a setup code", () => {
  it("keeps only a hash, expires in 15 minutes, and is scoped to the restaurant", async () => {
    const { svc, printers, calls } = setup([printer()]);
    const before = Date.now();
    const { code, expiresAt } = await svc.issuePairingCode("r1");
    assert.equal(printers[0].pairingCodeHash, sha(normalizePairingCode(code)!));
    assert.ok(!JSON.stringify(printers[0]).includes(code.replace("-", "")), "the code itself is never stored");
    assert.ok(Math.abs(expiresAt.getTime() - (before + PAIRING_TTL_MIN * 60_000)) < 5000);
    assert.equal(calls[0]!.args.where.restaurantId, "r1");
  });
  it("a printer must be saved first", async () => {
    await assert.rejects(setup([]).svc.issuePairingCode("r1"), BadRequestException);
  });
  it("a new code replaces the old one", async () => {
    const { svc } = setup([printer()]);
    const a = await svc.issuePairingCode("r1");
    const b = await svc.issuePairingCode("r1");
    await assert.rejects(svc.redeemPairingCode(a.code), BadRequestException);
    assert.ok((await svc.redeemPairingCode(b.code)).token.startsWith("pht_"));
  });
  it("another restaurant's printer is never touched", async () => {
    const { svc, printers } = setup([printer(), printer({ id: "p2", restaurantId: "r2" })]);
    await svc.issuePairingCode("r1");
    assert.equal(printers[1].pairingCodeHash, undefined);
  });
});

describe("trading a setup code for the helper's secret", () => {
  it("gives the secret once, with what the helper needs; the code is then spent", async () => {
    const { svc, printers } = setup([printer({ helperTokenHash: "old" })]);
    const { code } = await svc.issuePairingCode("r1");
    const got = await svc.redeemPairingCode(code.toLowerCase());
    assert.equal(got.printerId, "p1");
    assert.equal(got.label, "Chez Sam");
    assert.equal(got.host, "10.0.0.5");
    assert.equal(got.port, 9100);
    assert.equal(printers[0].helperTokenHash, sha(got.token));
    assert.ok(printers[0].helperTokenIssuedAt instanceof Date);
    assert.equal(printers[0].pairingCodeHash, null);
    await assert.rejects(svc.redeemPairingCode(code), BadRequestException);
  });
  it("a borne's label carries the borne's name", async () => {
    const { svc } = setup([printer({ kioskId: "k1" })], { kiosks: [{ id: "k1", restaurantId: "r1", name: "Borne terrasse" }] });
    const { code } = await svc.issuePairingCode("r1", "k1");
    assert.equal((await svc.redeemPairingCode(code)).label, "Chez Sam - Borne terrasse");
  });
  it("an expired code, an unknown code and a malformed code all get the same answer", async () => {
    const { svc, printers } = setup([printer()]);
    const { code } = await svc.issuePairingCode("r1");
    printers[0].pairingExpiresAt = new Date(Date.now() - 1000);
    const messages = new Set<string>();
    for (const c of [code, "ZZZZ-ZZZZ", "nope"]) {
      await assert.rejects(svc.redeemPairingCode(c), (e: any) => { messages.add(e.message); return e instanceof BadRequestException; });
    }
    assert.equal(messages.size, 1);
    assert.equal(printers[0].helperTokenHash, undefined, "an expired code must not change the secret");
  });
  it("two helpers racing with one code: only one wins", async () => {
    const { svc, printers } = setup([printer()]);
    const { code } = await svc.issuePairingCode("r1");
    const results = await Promise.allSettled([svc.redeemPairingCode(code), svc.redeemPairingCode(code)]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.ok(printers[0].helperTokenHash);
  });
  it("the swap itself is scoped by restaurant and checks the code and the clock", async () => {
    const { svc, calls } = setup([printer()]);
    const { code } = await svc.issuePairingCode("r1");
    calls.length = 0;
    await svc.redeemPairingCode(code);
    const w = calls[0]!.args.where;
    assert.equal(w.restaurantId, "r1");
    assert.equal(w.pairingCodeHash, sha(normalizePairingCode(code)!));
    assert.ok(w.pairingExpiresAt.gt instanceof Date);
  });
});

describe("what the back office shows", () => {
  it("a waiting code is visible, a used or expired one is not", () => {
    const now = Date.now();
    const p: any = (over: any) => ({ id: "p", name: "n", address: "a", port: 1, isEnabled: true, config: {}, lastSeenAt: null, helperTokenIssuedAt: null, lastErrorMessage: null, lastErrorAt: null, ...over });
    const pending = (x: any) => (summarizePrinter(x, now) as any).helper.pairingPending;
    assert.equal(pending(p({ pairingCodeHash: "h", pairingExpiresAt: new Date(now + 60_000) })), true);
    assert.equal(pending(p({ pairingCodeHash: "h", pairingExpiresAt: new Date(now - 1) })), false);
    assert.equal(pending(p({})), false);
  });
});
