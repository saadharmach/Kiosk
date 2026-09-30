import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Prisma } from "@prisma/client";
import { BrandingService } from "../src/restaurant/branding.service.js";

const RID = "11111111-1111-4111-8111-111111111111";

function setup(before: Record<string, unknown> = {}, sizes: Record<string, number | null> = {}) {
  const row: Record<string, unknown> = { id: RID, logoPath: null, heroImagePath: null, tagline: null, primaryColor: null, ...before };
  const updates: { where: Record<string, unknown>; data: Record<string, unknown> }[] = [];
  const removed: string[] = [];
  const prisma = {
    restaurant: {
      findUniqueOrThrow: async () => ({ ...row }),
      update: async (a: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        updates.push(a);
        Object.assign(row, a.data);
        return { ...row };
      },
    },
  };
  const storage = {
    publicUrl: (p: string | null) => (p ? `https://cdn.test/${p}` : null),
    objectSize: async (p: string) => (p in sizes ? sizes[p]! : 50_000),
    remove: async (p: string) => { removed.push(p); },
    signUpload: async (a: Record<string, unknown>) => a,
  };
  return { svc: new BrandingService(prisma as never, storage as never), updates, removed, row };
}

const logo = (name = "a.png") => `restaurants/${RID}/branding/logo/${name}`;
const hero = (name = "h.jpg") => `restaurants/${RID}/branding/hero/${name}`;
const bad = (p: Promise<unknown>, re: RegExp) =>
  assert.rejects(p, (e: { getStatus?: () => number; message: string }) => { assert.equal(e.getStatus?.(), 400); assert.match(e.message, re); return true; });

describe("BrandingService: images", () => {
  it("accepts a path from this restaurant's own signed upload and returns its public URL", async () => {
    const { svc } = setup();
    const r = await svc.update(RID, { logoPath: logo() });
    assert.equal(r.logoUrl, `https://cdn.test/${logo()}`);
  });

  it("rejects a path that belongs to another restaurant", () =>
    bad(setup().svc.update(RID, { heroImagePath: "restaurants/22222222-2222-4222-8222-222222222222/branding/hero/x.png" }), /signed hero upload/));

  it("rejects a logo path used as the hero, and the other way round", async () => {
    await bad(setup().svc.update(RID, { heroImagePath: logo() }), /signed hero upload/);
    await bad(setup().svc.update(RID, { logoPath: hero() }), /signed logo upload/);
  });

  it("rejects a path that tries to climb out of the folder", () =>
    bad(setup().svc.update(RID, { logoPath: `restaurants/${RID}/products/1/x.png` }), /signed logo upload/));

  it("rejects a file that was never uploaded", () =>
    bad(setup({}, { [logo("none.png")]: null }).svc.update(RID, { logoPath: logo("none.png") }), /not uploaded/));

  it("rejects a file too small to be an image (an 8-byte 'PNG' once got through)", () =>
    bad(setup({}, { [logo("tiny.png")]: 8 }).svc.update(RID, { logoPath: logo("tiny.png") }), /too small/));

  it("deletes the old file after replacing it, but not the new one", async () => {
    const { svc, removed } = setup({ logoPath: logo("old.png") });
    await svc.update(RID, { logoPath: logo("new.png") });
    assert.deepEqual(removed, [logo("old.png")]);
  });

  it("clears an image and deletes its file", async () => {
    const { svc, removed, row } = setup({ heroImagePath: hero("old.jpg") });
    await svc.update(RID, { heroImagePath: null });
    assert.equal(row.heroImagePath, null);
    assert.deepEqual(removed, [hero("old.jpg")]);
  });

  it("does not delete the file when the same path is saved again", async () => {
    const { svc, removed } = setup({ logoPath: logo("same.png") });
    await svc.update(RID, { logoPath: logo("same.png") });
    assert.deepEqual(removed, []);
  });

  it("leaves a field alone when it is not sent", async () => {
    const { svc, row, removed } = setup({ logoPath: logo("keep.png"), heroImagePath: hero("keep.jpg") });
    await svc.update(RID, { tagline: { fr: "x" } });
    assert.equal(row.logoPath, logo("keep.png"));
    assert.equal(row.heroImagePath, hero("keep.jpg"));
    assert.deepEqual(removed, []);
  });

  it("writes only to the restaurant that the token says, by its id", async () => {
    const { svc, updates } = setup();
    await svc.update(RID, { logoPath: logo() });
    assert.deepEqual(updates[0]!.where, { id: RID });
  });
});

describe("BrandingService: tagline", () => {
  it("keeps the languages with text, trimmed", async () => {
    const { svc, row } = setup();
    await svc.update(RID, { tagline: { fr: "  Cuisine fraîche ", en: "Fresh", ar: "" } });
    assert.deepEqual(row.tagline, { fr: "Cuisine fraîche", en: "Fresh" });
  });

  it("clears to a real NULL, not an empty object, when nothing is left", async () => {
    const a = setup({ tagline: { fr: "x" } });
    await a.svc.update(RID, { tagline: null });
    assert.equal(a.row.tagline, Prisma.DbNull);
    const b = setup({ tagline: { fr: "x" } });
    await b.svc.update(RID, { tagline: { fr: " ", en: "" } });
    assert.equal(b.row.tagline, Prisma.DbNull);
  });

  it("reads back only clean languages", async () => {
    const { svc } = setup({ tagline: { fr: "Oui", xx: "junk", en: 5 } });
    assert.deepEqual((await svc.get(RID)).tagline, { fr: "Oui" });
  });
});
