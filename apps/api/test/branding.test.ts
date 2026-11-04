import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Prisma } from "@prisma/client";
import { BrandingService, readSlides } from "../src/restaurant/branding.service.js";

const RID = "11111111-1111-4111-8111-111111111111";

function setup(before: Record<string, unknown> = {}, sizes: Record<string, number | null> = {}, menu: { restaurantId: string; untillId: bigint }[] = [{ restaurantId: RID, untillId: 42n }]) {
  const row: Record<string, unknown> = { id: RID, logoPath: null, welcomeSlides: [] as unknown[], tagline: null, subtitle: null, primaryColor: null, ...before };
  const updates: { where: Record<string, unknown>; data: Record<string, unknown> }[] = [];
  const removed: string[] = [];
  const prisma = {
    tpapiArticle: {
      findMany: async (a: { where: { restaurantId: string; untillId: { in: bigint[] } } }) =>
        menu.filter((m) => m.restaurantId === a.where.restaurantId && a.where.untillId.in.includes(m.untillId)).map((m) => ({ ...m, name: `Product ${m.untillId}` })),
    },
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
/** Slides from paths, as the back office sends them. */
const S = (ps: string[]) => ps.map((path) => ({ path }));
const paths = (slides: unknown) => (slides as { path: string }[]).map((x) => x.path);
const welcome = (name = "w.jpg") => `restaurants/${RID}/branding/welcome/${name}`;
const bad = (p: Promise<unknown>, re: RegExp) =>
  assert.rejects(p, (e: { getStatus?: () => number; message: string }) => { assert.equal(e.getStatus?.(), 400); assert.match(e.message, re); return true; });

describe("BrandingService: images", () => {
  it("accepts a path from this restaurant's own signed upload and returns its public URL", async () => {
    const { svc } = setup();
    const r = await svc.update(RID, { logoPath: logo() });
    assert.equal(r.logoUrl, `https://cdn.test/${logo()}`);
  });

  it("rejects a path that belongs to another restaurant", () =>
    bad(setup().svc.update(RID, { welcomeSlides: S(["restaurants/22222222-2222-4222-8222-222222222222/branding/welcome/x.png"]) }), /signed welcome upload/));

  it("rejects a logo path used as a welcome photo, and the other way round", async () => {
    await bad(setup().svc.update(RID, { welcomeSlides: S([logo()]) }), /signed welcome upload/);
    await bad(setup().svc.update(RID, { logoPath: welcome() }), /signed logo upload/);
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

  it("clears the logo and deletes its file", async () => {
    const { svc, removed, row } = setup({ logoPath: logo("old.png") });
    await svc.update(RID, { logoPath: null });
    assert.equal(row.logoPath, null);
    assert.deepEqual(removed, [logo("old.png")]);
  });

  it("does not delete the file when the same path is saved again", async () => {
    const { svc, removed } = setup({ logoPath: logo("same.png") });
    await svc.update(RID, { logoPath: logo("same.png") });
    assert.deepEqual(removed, []);
  });

  it("leaves a field alone when it is not sent", async () => {
    const { svc, row, removed } = setup({ logoPath: logo("keep.png"), welcomeSlides: S([welcome("keep.jpg")]) });
    await svc.update(RID, { tagline: { fr: "x" } });
    assert.equal(row.logoPath, logo("keep.png"));
    assert.deepEqual(paths(row.welcomeSlides), [welcome("keep.jpg")]);
    assert.deepEqual(removed, []);
  });

  it("writes only to the restaurant that the token says, by its id", async () => {
    const { svc, updates } = setup();
    await svc.update(RID, { logoPath: logo() });
    assert.deepEqual(updates[0]!.where, { id: RID });
  });
});

describe("BrandingService: welcome photos (offers, adverts)", () => {
  it("saves the list in the order given and returns each photo's public URL", async () => {
    const { svc, row } = setup();
    const r = await svc.update(RID, { welcomeSlides: S([welcome("a.jpg"), welcome("b.jpg")]) });
    assert.deepEqual(paths(row.welcomeSlides), [welcome("a.jpg"), welcome("b.jpg")]);
    assert.deepEqual(r.welcomeSlides.map((w) => w.url), [`https://cdn.test/${welcome("a.jpg")}`, `https://cdn.test/${welcome("b.jpg")}`]);
  });
  it("adding one keeps the others; a removed one is deleted from storage, a kept one is not", async () => {
    const { svc, removed, row } = setup({ welcomeSlides: S([welcome("a.jpg"), welcome("b.jpg")]) });
    await svc.update(RID, { welcomeSlides: S([welcome("b.jpg"), welcome("c.jpg")]) });
    assert.deepEqual(paths(row.welcomeSlides), [welcome("b.jpg"), welcome("c.jpg")]);
    assert.deepEqual(removed, [welcome("a.jpg")]);
  });
  it("reordering checks nothing new and deletes nothing", async () => {
    // Sizes say "not uploaded" for both: reordering must not ask storage again.
    const { svc, removed } = setup({ welcomeSlides: S([welcome("a.jpg"), welcome("b.jpg")]) }, { [welcome("a.jpg")]: null, [welcome("b.jpg")]: null });
    await svc.update(RID, { welcomeSlides: S([welcome("b.jpg"), welcome("a.jpg")]) });
    assert.deepEqual(removed, []);
  });
  it("a photo kept from before still counts, even from the old single-photo folder", async () => {
    const old = `restaurants/${RID}/branding/hero/old.jpg`;
    const { svc, row } = setup({ welcomeSlides: S([old]) });
    await svc.update(RID, { welcomeSlides: S([old, welcome("new.jpg")]) });
    assert.deepEqual(paths(row.welcomeSlides), [old, welcome("new.jpg")]);
  });
  it("an empty list removes them all", async () => {
    const { svc, removed, row } = setup({ welcomeSlides: S([welcome("a.jpg")]) });
    await svc.update(RID, { welcomeSlides: S([]) });
    assert.deepEqual(paths(row.welcomeSlides), []);
    assert.deepEqual(removed, [welcome("a.jpg")]);
  });
  it("at most 5, no duplicates, and each new one must really be uploaded", async () => {
    await bad(setup().svc.update(RID, { welcomeSlides: S(["1", "2", "3", "4", "5", "6"].map((n) => welcome(`${n}.jpg`))) }), /At most 5/);
    await bad(setup().svc.update(RID, { welcomeSlides: S([welcome("a.jpg"), welcome("a.jpg")]) }), /twice/);
    await bad(setup({}, { [welcome("none.jpg")]: null }).svc.update(RID, { welcomeSlides: S([welcome("none.jpg")]) }), /not uploaded/);
    await bad(setup({}, { [welcome("tiny.jpg")]: 8 }).svc.update(RID, { welcomeSlides: S([welcome("tiny.jpg")]) }), /too small/);
  });
  it("a path that climbs out of the folder is refused", () =>
    bad(setup().svc.update(RID, { welcomeSlides: S([`restaurants/${RID}/branding/welcome/../../products/1/x.png`]) }), /signed welcome upload/));
  it("nothing is deleted when saving fails", async () => {
    const { svc, removed } = setup({ welcomeSlides: S([welcome("a.jpg")]) }, { [welcome("none.jpg")]: null });
    await assert.rejects(svc.update(RID, { welcomeSlides: S([welcome("none.jpg")]) }));
    assert.deepEqual(removed, []);
  });
});

describe("BrandingService: welcome slides with videos and products", () => {
  it("a slide can be a video; it is reported as one", async () => {
    const { svc } = setup();
    const r = await svc.update(RID, { welcomeSlides: S([welcome("a.jpg"), welcome("b.mp4")]) });
    assert.deepEqual(r.welcomeSlides.map((x) => x.kind), ["image", "video"]);
  });
  it("a slide can show a product from this restaurant's menu", async () => {
    const { svc, row } = setup();
    const r = await svc.update(RID, { welcomeSlides: [{ path: welcome("a.jpg"), productId: "42" }, { path: welcome("b.jpg") }] });
    assert.deepEqual(row.welcomeSlides, [{ path: welcome("a.jpg"), productId: "42" }, { path: welcome("b.jpg"), productId: null }]);
    assert.deepEqual(r.welcomeSlides.map((x) => x.productName), ["Product 42", null], "the back office is told which product");
  });
  it("a product that is not on this restaurant's menu is refused, and nothing is saved", async () => {
    const { svc, updates } = setup({}, {}, [{ restaurantId: "other", untillId: 7n }]);
    await bad(svc.update(RID, { welcomeSlides: [{ path: welcome("a.jpg"), productId: "7" }] }), /not on this restaurant's menu/);
    assert.equal(updates.length, 0);
  });
  it("changing only the product of a slide checks nothing again and deletes nothing", async () => {
    const { svc, removed } = setup({ welcomeSlides: [{ path: welcome("a.jpg"), productId: null }] }, { [welcome("a.jpg")]: null });
    await svc.update(RID, { welcomeSlides: [{ path: welcome("a.jpg"), productId: "42" }] });
    assert.deepEqual(removed, []);
  });
  it("a malformed list in the database reads as what can be used", () => {
    assert.deepEqual(readSlides([{ path: "p", productId: "12" }, { path: 5 }, null, "x", { path: "q", productId: "x1" }]), [
      { path: "p", productId: "12" }, { path: "q", productId: null },
    ]);
    assert.deepEqual(readSlides({ not: "a list" }), []);
  });
  it("the second welcome line works like the first", async () => {
    const { svc, row } = setup();
    await svc.update(RID, { subtitle: { fr: "  Des burgers généreux. ", en: "" } });
    assert.deepEqual(row.subtitle, { fr: "Des burgers généreux." });
    await svc.update(RID, { subtitle: null });
    assert.equal(row.subtitle, Prisma.DbNull);
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
