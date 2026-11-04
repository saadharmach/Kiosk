import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { SCREEN_NOT_REGISTERED, redeemScreenCode, resolveScreen } from "../src/kiosk/screen.js";
import { KiosksService } from "../src/restaurant/kiosks.service.js";
import { CatalogService } from "../src/kiosk/catalog.service.js";

const R = "r1";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const SECRET = "ksc_" + "a".repeat(43);

/** Two bornes; K1's screen is registered with SECRET. */
function bornes(over: any[] = []) {
  const rows: any[] = [
    { id: "k1", restaurantId: R, code: "K1", name: "Entrée", isEnabled: true, tokenHash: sha(SECRET), tokenRevokedAt: null, registrationCodeHash: null, registrationExpiresAt: null },
    { id: "k2", restaurantId: R, code: "K2", name: "Terrasse", isEnabled: true, tokenHash: null, tokenRevokedAt: null, registrationCodeHash: null, registrationExpiresAt: null },
    ...over,
  ];
  const updates: any[] = [];
  const match = (r: any, w: any) => Object.entries(w).every(([k, v]) => (v && typeof v === "object" && "gt" in (v as any) ? r[k] > (v as any).gt : v && typeof v === "object" && "not" in (v as any) ? r[k] !== (v as any).not : r[k] === v));
  const prisma: any = {
    kiosk: {
      findFirst: async (a: any) => rows.find((r) => match(r, a.where)) ?? null,
      updateMany: async (a: any) => { updates.push(a); let count = 0; for (const r of rows) if (match(r, a.where)) { Object.assign(r, a.data); count++; } return { count }; },
      count: async (a: any) => rows.filter((r) => match(r, a.where)).length,
    },
  };
  return { prisma, rows, updates };
}
const resto = (required: boolean) => ({ id: R, name: "Chez", settings: { requireRegisteredBornes: required } });

describe("which borne is this screen?", () => {
  it("a registered screen is its own borne, whatever the address says (?borne=K2 cannot impersonate)", async () => {
    const { prisma } = bornes();
    assert.deepEqual(await resolveScreen(prisma, resto(true), SECRET, "K2"), { id: "k1", code: "K1", name: "Entrée" });
  });

  it("required: a device without a secret, or with a wrong or revoked one, is refused with a code the kiosk recognises", async () => {
    const { prisma, rows } = bornes();
    const notRegistered = (e: unknown) => e instanceof UnauthorizedException && (e.getResponse() as any).code === SCREEN_NOT_REGISTERED;
    await assert.rejects(resolveScreen(prisma, resto(true), undefined, "K1"), notRegistered);
    await assert.rejects(resolveScreen(prisma, resto(true), "ksc_" + "b".repeat(43), "K1"), notRegistered);
    await assert.rejects(resolveScreen(prisma, resto(true), "not-a-secret", "K1"), notRegistered);
    rows[0].tokenRevokedAt = new Date();
    await assert.rejects(resolveScreen(prisma, resto(true), SECRET), notRegistered);
  });

  it("not required: as before (the borne in the address, or none)", async () => {
    const { prisma } = bornes();
    assert.equal((await resolveScreen(prisma, resto(false), undefined, "K2"))?.code, "K2");
    assert.equal(await resolveScreen(prisma, resto(false), undefined, undefined), null);
  });

  it("a registered screen of a switched-off borne gets the calm 'unavailable' answer", async () => {
    const { prisma, rows } = bornes();
    rows[0].isEnabled = false;
    await assert.rejects(resolveScreen(prisma, resto(true), SECRET), ServiceUnavailableException);
  });
});

describe("registering a screen", () => {
  const future = () => new Date(Date.now() + 60_000);

  it("a valid code gives a secret once; only its hash is stored; the code is used up", async () => {
    const { prisma, rows } = bornes();
    rows[1].registrationCodeHash = sha("K7QF92XM");
    rows[1].registrationExpiresAt = future();
    const r = await redeemScreenCode(prisma, R, "k7qf-92xm");
    assert.match(r.secret, /^ksc_[A-Za-z0-9_-]{40,}$/);
    assert.deepEqual(r.borne, { code: "K2", name: "Terrasse" });
    assert.equal(rows[1].tokenHash, sha(r.secret));
    assert.equal(rows[1].registrationCodeHash, null);
    await assert.rejects(redeemScreenCode(prisma, R, "K7QF-92XM"), /not valid/);
    assert.deepEqual(await resolveScreen(prisma, resto(true), r.secret), { id: "k2", code: "K2", name: "Terrasse" });
  });

  it("an expired code, another restaurant's code, or rubbish: the same answer, nothing changes", async () => {
    const { prisma, rows } = bornes();
    rows[1].registrationCodeHash = sha("K7QF92XM");
    rows[1].registrationExpiresAt = new Date(Date.now() - 1000);
    await assert.rejects(redeemScreenCode(prisma, R, "K7QF-92XM"), /not valid/);
    rows[1].registrationExpiresAt = future();
    await assert.rejects(redeemScreenCode(prisma, "another-restaurant", "K7QF-92XM"), /not valid/);
    await assert.rejects(redeemScreenCode(prisma, R, "hello"), /not valid/);
    assert.equal(rows[1].tokenHash, null);
  });

  it("registering again replaces the borne's previous screen", async () => {
    const { prisma, rows } = bornes();
    rows[0].registrationCodeHash = sha("K7QF92XM");
    rows[0].registrationExpiresAt = future();
    await redeemScreenCode(prisma, R, "K7QF-92XM");
    await assert.rejects(resolveScreen(prisma, resto(true), SECRET), UnauthorizedException, "the old screen's secret no longer works");
  });
});

describe("the back office side", () => {
  function service(over: any[] = []) {
    const b = bornes(over);
    const settingsWrites: any[] = [];
    b.prisma.kiosk.findUnique = async () => null;
    b.prisma.kiosk.findFirst = (orig => async (a: any) => orig(a))(b.prisma.kiosk.findFirst);
    b.prisma.restaurantSettings = {
      findUnique: async () => ({ requireRegisteredBornes: settingsWrites.at(-1)?.update.requireRegisteredBornes ?? false }),
      upsert: async (a: any) => { settingsWrites.push(a); return {}; },
    };
    const svc = new KiosksService(b.prisma);
    (svc as any).require = async (restaurantId: string, id: string) => { assert.equal(restaurantId, R); if (!b.rows.some((r) => r.id === id)) throw new Error("not found"); };
    return { svc, ...b, settingsWrites };
  }

  it("a code for one borne, scoped to the restaurant, only its hash kept", async () => {
    const { svc, rows, updates } = service();
    const { code } = await svc.screenCode(R, "k2");
    assert.match(code, /^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    assert.deepEqual(updates[0].where, { id: "k2", restaurantId: R });
    assert.equal(rows[1].registrationCodeHash, sha(code.replace("-", "")));
  });

  it("unregistering ends the screen's secret at once", async () => {
    const { svc, prisma } = service();
    await svc.unregisterScreen(R, "k1");
    await assert.rejects(resolveScreen(prisma, resto(true), SECRET), UnauthorizedException);
  });

  it("the switch cannot be turned on while no borne has a registered screen (every kiosk would stop)", async () => {
    const { svc, rows, settingsWrites } = service();
    rows[0].tokenHash = null;
    await assert.rejects(svc.setRegistration(R, true), /Register at least one/);
    assert.equal(settingsWrites.length, 0);
    rows[0].tokenHash = sha(SECRET);
    assert.deepEqual(await svc.setRegistration(R, true), { required: true });
    assert.equal(settingsWrites[0].where.restaurantId, R);
  });
});

describe("with registration required, an unregistered device gets nothing", () => {
  it("not even the menu", async () => {
    const prisma: any = {
      restaurant: { findUnique: async () => ({ id: R, name: "Chez", currency: "MAD", status: "ACTIVE", locale: "fr", timezone: "UTC", settings: { showAllergens: false, requireRegisteredBornes: true } }) },
      subscriptionPeriod: { findFirst: async () => ({ id: "running" }) },
      kiosk: { findFirst: async () => null },
    };
    const svc = new CatalogService(prisma, { publicUrl: () => null } as never);
    await assert.rejects(svc.catalog("chez", undefined, "fr"), (e: unknown) => (e as any).getResponse?.().code === SCREEN_NOT_REGISTERED);
  });
});
