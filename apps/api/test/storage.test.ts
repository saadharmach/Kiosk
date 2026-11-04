import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { after, before, describe, it } from "node:test";
import { MAX_IMAGE_BYTES, StorageService, isMediaPath, sniffMediaType } from "../src/common/storage.service.js";

const R = "11111111-1111-4111-8111-111111111111";
let dir: string;
before(() => { dir = mkdtempSync(path.join(tmpdir(), "media-")); process.env.MEDIA_DIR = dir; process.env.JWT_SECRET = "x".repeat(40); });
after(() => rmSync(dir, { recursive: true, force: true }));

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(3000, 7)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(3000, 1)]);
const tokenOf = (url: string) => url.split("/").pop()!;
const svc = () => new StorageService();
async function signed(contentType = "image/png") {
  return svc().signUpload({ restaurantId: R, kind: "products", ownerId: "42", contentType });
}
const filesIn = (d: string): string[] => readdirSync(d, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name);

describe("photos on the server's disk", () => {
  it("an upload address leads to the API itself, for one unguessable path in this restaurant's folder", async () => {
    const s = await signed();
    assert.match(s.uploadUrl, /^\/api\/media\/upload\/[\w-]+\.[\w-]+$/);
    assert.match(s.path, new RegExp(`^restaurants/${R}/products/42/[0-9a-f-]{36}\\.png$`));
    assert.equal(s.publicUrl, `/api/media/files/${s.path}`);
    assert.notEqual((await signed()).path, s.path);
  });

  it("stores the file, and it can then be found and measured", async () => {
    const s = await signed();
    const r = await svc().receive(tokenOf(s.uploadUrl), "image/png", Readable.from(PNG), PNG.length);
    assert.deepEqual(r, { path: s.path, size: PNG.length });
    assert.equal(await svc().objectSize(s.path), PNG.length);
  });

  it("a tampered, forged or expired address is refused, and nothing is written", async () => {
    const s = await signed();
    const t = tokenOf(s.uploadUrl);
    const [body, sig] = t.split(".");
    const otherPath = Buffer.from(JSON.stringify({ p: `restaurants/${R}/products/42/00000000-0000-4000-8000-000000000000.png`, t: "image/png", e: 9999999999 })).toString("base64url");
    for (const bad of [`${otherPath}.${sig}`, `${body}.AAAA`, "nope", `${body}`]) {
      await assert.rejects(svc().receive(bad, "image/png", Readable.from(PNG)), /not valid/, bad.slice(0, 20));
    }
    const old = process.env.JWT_SECRET; process.env.JWT_SECRET = "y".repeat(40);
    await assert.rejects(svc().receive(t, "image/png", Readable.from(PNG)), /not valid/, "signed with another key");
    process.env.JWT_SECRET = old;
    const realNow = Date.now; Date.now = () => realNow() + 301_000;
    try { await assert.rejects(svc().receive(t, "image/png", Readable.from(PNG)), /expired/); } finally { Date.now = realNow; }
    assert.equal(await svc().objectSize(s.path), null);
  });

  it("the type must be the one signed for, and the bytes must really be that image", async () => {
    const s = await signed("image/png");
    await assert.rejects(svc().receive(tokenOf(s.uploadUrl), "image/jpeg", Readable.from(JPG)), /expects image\/png/);
    await assert.rejects(svc().receive(tokenOf(s.uploadUrl), "image/png", Readable.from(Buffer.from("<html><script>alert(1)</script></html>".padEnd(2000)))), /not the image or video it claims/);
    await assert.rejects(svc().receive(tokenOf(s.uploadUrl), "image/png", Readable.from(JPG)), /not the image or video it claims/);
    assert.equal(await svc().objectSize(s.path), null);
    assert.ok(!filesIn(dir).some((f) => f.includes(".part-")), "no half-written file is left behind");
  });

  it("too big is refused, whether announced or not, and nothing is kept", async () => {
    const s = await signed();
    await assert.rejects(svc().receive(tokenOf(s.uploadUrl), "image/png", Readable.from(PNG), MAX_IMAGE_BYTES + 1), /too big/);
    const huge = Readable.from((function* () { yield PNG; for (let i = 0; i < 9; i++) yield Buffer.alloc(1024 * 1024); })());
    await assert.rejects(svc().receive(tokenOf(s.uploadUrl), "image/png", huge), /too big/);
    assert.equal(await svc().objectSize(s.path), null);
    assert.ok(!filesIn(dir).some((f) => f.includes(".part-")));
  });

  it("an address works once", async () => {
    const s = await signed();
    await svc().receive(tokenOf(s.uploadUrl), "image/png", Readable.from(PNG));
    await assert.rejects(svc().receive(tokenOf(s.uploadUrl), "image/png", Readable.from(PNG)), /already used/);
  });

  it("deleting removes the file; a missing file is fine; a path that is not ours is never touched", async () => {
    const s = await signed();
    await svc().receive(tokenOf(s.uploadUrl), "image/png", Readable.from(PNG));
    await svc().remove(s.path);
    assert.equal(await svc().objectSize(s.path), null);
    await svc().remove(s.path);
    const outside = path.join(dir, "..", `keep-${Date.now()}.txt`); writeFileSync(outside, "x");
    await svc().remove(`restaurants/${R}/products/42/../../../../${path.basename(outside)}`);
    await svc().remove(path.relative(dir, outside));
    assert.ok(existsSync(outside)); rmSync(outside);
    assert.equal(await svc().objectSize("../../etc/passwd"), null);
    // Inside the folder but not the shape of an upload (a config file, a half-written upload): left alone.
    writeFileSync(path.join(dir, "notes.txt"), "keep me");
    await svc().remove("notes.txt");
    assert.ok(existsSync(path.join(dir, "notes.txt")));
    assert.equal(await svc().objectSize("notes.txt"), null);
  });

  it("only the known path shape counts as ours", () => {
    assert.ok(isMediaPath(`restaurants/${R}/branding/welcome/0f9c8b3e-1d2a-4c5b-9e8f-7a6b5c4d3e2f.jpg`));
    assert.ok(isMediaPath(`restaurants/${R}/categories/department-7/0f9c8b3e-1d2a-4c5b-9e8f-7a6b5c4d3e2f.webp`));
    for (const bad of ["/etc/passwd", `restaurants/${R}/../x.png`, `restaurants/${R}/products/42/x.png`, `restaurants/${R}/products/42/0f9c8b3e-1d2a-4c5b-9e8f-7a6b5c4d3e2f.svg`, `restaurants/${R}/other/42/0f9c8b3e-1d2a-4c5b-9e8f-7a6b5c4d3e2f.png`]) {
      assert.equal(isMediaPath(bad), false, bad);
    }
  });

  it("videos: only for the welcome slides, up to 50 MB, and they must really be videos", async () => {
    await assert.rejects(svc().signUpload({ restaurantId: R, kind: "products", ownerId: "42", contentType: "video/mp4" }), /Unsupported file type/);
    await assert.rejects(svc().signUpload({ restaurantId: R, kind: "branding", ownerId: "logo", contentType: "video/mp4" }), /Unsupported file type/);
    const MP4 = Buffer.concat([Buffer.from("\0\0\0\x20ftypisom\0\0\x02\0", "latin1"), Buffer.alloc(9 * 1024 * 1024, 3)]);
    const s = await svc().signUpload({ restaurantId: R, kind: "branding", ownerId: "welcome", contentType: "video/mp4" });
    assert.match(s.path, /\.mp4$/);
    const r = await svc().receive(tokenOf(s.uploadUrl), "video/mp4", Readable.from(MP4), MP4.length);
    assert.equal(r.size, MP4.length, "a 9 MB video is fine (photos stop at 8 MB)");
    const s2 = await svc().signUpload({ restaurantId: R, kind: "branding", ownerId: "welcome", contentType: "video/mp4" });
    await assert.rejects(svc().receive(tokenOf(s2.uploadUrl), "video/mp4", Readable.from(PNG), 51 * 1024 * 1024), /video is too big \(50 MB/);
    await assert.rejects(svc().receive(tokenOf(s2.uploadUrl), "video/mp4", Readable.from(PNG)), /not the image or video it claims/);
    const s3 = await svc().signUpload({ restaurantId: R, kind: "branding", ownerId: "welcome", contentType: "image/png" });
    await assert.rejects(svc().receive(tokenOf(s3.uploadUrl), "image/png", Readable.from(PNG), 9 * 1024 * 1024), /photo is too big \(8 MB/);
  });

  it("recognises the image and video types by their first bytes", () => {
    assert.equal(sniffMediaType(Buffer.from("\0\0\0\x20ftypisom\0\0", "latin1")), "video/mp4");
    assert.equal(sniffMediaType(Buffer.from("\0\0\0\x18ftypmp42\0\0", "latin1")), "video/mp4");
    assert.equal(sniffMediaType(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81])), "video/webm");
    assert.equal(sniffMediaType(PNG), "image/png");
    assert.equal(sniffMediaType(JPG), "image/jpeg");
    assert.equal(sniffMediaType(Buffer.from("RIFF\0\0\0\0WEBPVP8 ", "latin1")), "image/webp");
    assert.equal(sniffMediaType(Buffer.from("\0\0\0\x1cftypavif\0\0", "latin1")), "image/avif");
    assert.equal(sniffMediaType(Buffer.from("<svg xmlns=")), null);
  });
});
